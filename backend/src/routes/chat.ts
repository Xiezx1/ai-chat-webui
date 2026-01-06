import type { FastifyPluginAsync } from "fastify";
import {
    openRouterChatComplete,
    openRouterChatStream,
} from "../providers/openrouter";
import type { ChatMessage } from "../providers/openrouter";
import { toPublicError } from "../utils/errors";
import { debugToken, debugDb } from "../utils/debug";
import { estimateConversationTokens } from "../utils/tokenEstimator";
import { estimateChatUsage } from "../utils/tokenEstimator";
import { calculateUsdCost } from "../utils/modelPricing";
import { promises as fs } from "fs";
import { uploadPath } from "../utils/uploads";
import { PDFParse } from "pdf-parse";
import * as mammoth from "mammoth";

const FILE_CONTEXT_SYSTEM_PROMPT =
    "你可能会在用户消息中看到一个或多个文件内容块，格式为【附件内容：文件名】后跟若干文本。" +
    "这些文本就是用户上传附件（如 PDF/DOCX/TXT）中提取出来的内容，请直接基于其内容回答。" +
    "不要说你无法访问/读取附件；如果内容被截断或为空，请明确说明需要用户补充。" +
    "如果没有看到任何【附件内容：...】块，但用户说上传了附件，请提示用户重新发送包含附件的消息，或说明文件可能是扫描件/加密导致无法抽取文本。";

type ChatContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

function getChatTimeoutMs() {
    const v = Number(process.env.CHAT_TIMEOUT_MS || 300_000);
    if (!Number.isFinite(v) || v <= 0) return 300_000;
    return v;
}

function extractFileIdsFromText(text: string): number[] {
    if (!text) return [];
    const ids = new Set<number>();
    const re = /\/api\/files\/(\d+)\/(?:raw|download)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const id = Number(m[1]);
        if (Number.isFinite(id)) ids.add(id);
    }
    return Array.from(ids);
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function buildAttachmentSummaryText(rows: Array<{ originalName: string }>): string {
    if (!rows || rows.length === 0) return "";
    const names = rows
        .map((r) => String(r.originalName || "").trim())
        .filter(Boolean)
        .slice(0, 8);
    if (names.length === 0) return "";
    return `用户上传了附件：${names.join("、")}`;
}

async function loadAttachmentSummaryText(app: any, userId: number, fileIds: number[]): Promise<string> {
    const ids = (fileIds || [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
    if (ids.length === 0) return "";

    const limited = ids.slice(0, 8);
    const rows = await app.prisma.uploadedFile.findMany({
        where: { id: { in: limited }, userId },
        select: { id: true, originalName: true, mime: true },
    });

    // 只为“非图片”生成摘要；图片的语义走多模态
    const nonImage = rows.filter((r: any) => !String(r.mime || "").startsWith("image/"));
    return buildAttachmentSummaryText(nonImage);
}

function normalizeExtractedText(text: string, maxChars: number) {
    const t = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
    if (t.length <= maxChars) return t;
    return t.slice(0, maxChars) + "\n\n[内容已截断]";
}

function normalizeExtractedTextForCursor(text: string) {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

function isContinueMessage(text: string): boolean {
    const t = String(text || "").trim();
    if (!t) return false;
    return /^(继续|继续阅读|继续看|下一段|下一页|下页|后面|往后|next|continue)$/i.test(t);
}

async function resolveContinueTargetFileIds(
    app: any,
    userId: number,
    conversationId: number,
    explicitFileIds: number[]
): Promise<number[]> {
    const ids = (explicitFileIds || [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
    if (ids.length > 0) return ids;

    const latestCursor = await app.prisma.fileReadCursor.findFirst({
        where: { conversationId, userId },
        orderBy: { updatedAt: "desc" },
        select: { fileId: true },
    });
    if (latestCursor?.fileId) return [Number(latestCursor.fileId)];

    const recentUserMessages = await app.prisma.message.findMany({
        where: { conversationId, role: "user" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { content: true },
    });
    for (const m of recentUserMessages) {
        const found = extractFileIdsFromText(String(m.content || ""));
        if (found.length > 0) return found;
    }

    return [];
}

async function extractTextFromUploadedFile(row: { storedName: string; mime: string; originalName: string }) {
    const storedPath = uploadPath(row.storedName);
    const buf = await fs.readFile(storedPath);

    const mime = String(row.mime || "");
    const lowerName = String(row.originalName || "").toLowerCase();

    // PDF
    if (mime.includes("pdf") || lowerName.endsWith(".pdf")) {
        const parser = new PDFParse({ data: buf });
        const r = await parser.getText();
        return (r as any)?.text || "";
    }

    // DOCX
    if (
        mime.includes("officedocument.wordprocessingml") ||
        lowerName.endsWith(".docx")
    ) {
        const extractFn: any = (mammoth as any).extractRawText || (mammoth as any).default?.extractRawText;
        const r = extractFn ? await extractFn({ buffer: buf }) : { value: "" };
        return r.value || "";
    }

    // Plain text / markdown / json / code
    if (
        mime.startsWith("text/") ||
        mime.includes("json") ||
        lowerName.endsWith(".md") ||
        lowerName.endsWith(".txt") ||
        lowerName.endsWith(".json") ||
        lowerName.endsWith(".csv")
    ) {
        return buf.toString("utf8");
    }

    return "";
}

async function loadTextAttachmentBlock(
    app: any,
    userId: number,
    conversationId: number,
    fileIds: number[],
    options?: { continue?: boolean }
) {
    const isContinue = options?.continue === true;
    const baseIds = (fileIds || [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
    const ids = isContinue
        ? await resolveContinueTargetFileIds(app, userId, conversationId, baseIds)
        : baseIds;

    if (ids.length === 0) {
        if (isContinue) {
            const err: any = new Error("没有可续读的附件：请先发送带 PDF/DOCX/TXT 的消息，或在本次消息里重新选择附件。");
            err.statusCode = 400;
            err.code = "NO_CONTINUE_FILE";
            throw err;
        }
        return "";
    }

    // 默认提高阈值：适配 128k/256k 上下文模型（仍可通过 env 下调/上调）
    const maxFiles = Number(process.env.MAX_TEXT_ATTACHMENTS || 5);
    const maxTotalChars = Number(process.env.MAX_TEXT_ATTACHMENT_CHARS || 220_000);
    const maxPerFileChars = Number(process.env.MAX_TEXT_ATTACHMENT_CHARS_PER_FILE || 80_000);

    const limited = ids.slice(0, 8);
    const rows = await app.prisma.uploadedFile.findMany({
        where: { id: { in: limited }, userId },
        select: { id: true, storedName: true, originalName: true, mime: true },
    });

    // 非图片才尝试抽取
    const candidates = rows
        .filter((r: any) => !String(r.mime || "").startsWith("image/"))
        .slice(0, maxFiles);

    debugDb(
        "Text attachments candidates",
        candidates.map((r: any) => ({ id: r.id, name: r.originalName, mime: r.mime }))
    );

    let remaining = maxTotalChars;
    const blocks: string[] = [];
    for (const r of candidates) {
        if (remaining <= 0) break;
        try {
            const raw = await extractTextFromUploadedFile(r);
            const allText = normalizeExtractedTextForCursor(raw);
            if (!allText) {
                blocks.push(
                    `【附件内容：${r.originalName}】\n[未能从该附件中提取到可读文本。可能原因：扫描件图片型PDF、加密/受保护文档、或文件格式暂不支持。]`
                );
                continue;
            }

            const existing = await app.prisma.fileReadCursor.findFirst({
                where: { conversationId, fileId: r.id, userId },
                select: { offset: true },
            });
            const start = isContinue ? Number(existing?.offset || 0) : 0;
            const chunkLen = Math.min(maxPerFileChars, remaining);
            const end = Math.min(allText.length, start + chunkLen);
            const chunk = allText.slice(start, end);

            if (!chunk) {
                blocks.push(`【附件内容：${r.originalName}】\n[已读完：该附件没有更多可续读内容。]`);
                await app.prisma.fileReadCursor
                    .upsert({
                        where: { conversationId_fileId: { conversationId, fileId: r.id } },
                        update: { userId, offset: allText.length },
                        create: { userId, conversationId, fileId: r.id, offset: allText.length },
                    })
                    .catch(() => { });
                continue;
            }

            await app.prisma.fileReadCursor
                .upsert({
                    where: { conversationId_fileId: { conversationId, fileId: r.id } },
                    update: { userId, offset: end },
                    create: { userId, conversationId, fileId: r.id, offset: end },
                })
                .catch(() => { });

            const chunkOut = end < allText.length ? chunk + "\n\n[内容已截断]" : chunk;
            remaining -= chunkOut.length;
            blocks.push(`【附件内容：${r.originalName}】\n${chunkOut}`);
        } catch {
            blocks.push(
                `【附件内容：${r.originalName}】\n[解析失败：无法读取该附件内容。请尝试更换为可复制文本的PDF/DOCX，或粘贴关键段落。]`
            );
        }
    }

    return blocks.join("\n\n");
}

function stripFileMarkdownLines(text: string): string {
    const lines = String(text || "").split("\n");
    const kept: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^!\[[^\]]*\]\(\/api\/files\/\d+\/(?:raw|download)\)$/.test(trimmed)) continue;
        if (/^\[[^\]]+\]\(\/api\/files\/\d+\/(?:raw|download)\)$/.test(trimmed)) continue;
        kept.push(line);
    }
    return kept.join("\n").trim();
}

async function loadImageParts(app: any, userId: number, fileIds: number[]): Promise<ChatContentPart[]> {
    const ids = (fileIds || [])
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
    if (ids.length === 0) return [];

    // 限制数量，避免一次塞太多图片导致请求过大
    const limited = ids.slice(0, 8);

    const rows = await app.prisma.uploadedFile.findMany({
        where: { id: { in: limited }, userId },
        select: { id: true, storedName: true, mime: true, size: true },
    });

    // 只支持图片走多模态
    const imageRows = rows.filter((r: any) => String(r.mime || "").startsWith("image/"));
    if (imageRows.length === 0) return [];

    // 总大小限制（图片 base64 会膨胀），这里先保守一点
    const totalBytes = imageRows.reduce((sum: number, r: any) => sum + (Number(r.size) || 0), 0);
    const maxBytes = Number(process.env.MAX_IMAGE_BYTES || 8 * 1024 * 1024);
    if (totalBytes > maxBytes) {
        const err: any = new Error("图片总大小过大，请减少图片数量或压缩后再试");
        err.statusCode = 413;
        err.code = "IMAGE_TOO_LARGE";
        throw err;
    }

    const parts: ChatContentPart[] = [];
    for (const r of imageRows) {
        const buf = await fs.readFile(uploadPath(r.storedName));
        const b64 = buf.toString("base64");
        parts.push({
            type: "image_url",
            image_url: { url: `data:${r.mime};base64,${b64}` },
        });
    }
    return parts;
}
function titleFromFirstUserMessage(text: string) {
    const t = text.trim().replace(/\s+/g, " ");
    return t.length > 40 ? t.slice(0, 40) + "…" : t || "New Chat";
}

type NDJSONError = { code: string; message: string };

const routes: FastifyPluginAsync = async (app) => {
    // ---------------------------
    // 非流式（保留你现有的闭环）+ 小增强：写入 status
    // ---------------------------
    app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
        const userId = Number((request.user as any).id);
        if (!Number.isFinite(userId)) {
            return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
        }

        // 关键：确认 DB 里真的存在这个 user（避免外键 500）
        const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) {
            return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
        }

        try {
            const body = request.body as any;
            const displayInput = String(body?.message || "").trim();
            const promptText = stripFileMarkdownLines(String(body?.prompt ?? displayInput));
            const model = String(body?.model || "openai/gpt-4o-mini");
            const fileIds = Array.isArray(body?.fileIds) ? body.fileIds : [];
            const wantsContinue = isContinueMessage(promptText);
            let conversationId: number;
            const providedConversationId = body?.conversationId ? Number(body.conversationId) : undefined;

            if (wantsContinue && !providedConversationId) {
                return reply
                    .code(400)
                    .send({ error: { code: "BAD_REQUEST", message: "“继续”需要在已有会话中使用：请在同一会话里发送“继续”。" } });
            }

            // 允许“只发图片不发文字”；但至少要有文字或图片之一
            const imageParts = await loadImageParts(app, userId, fileIds);
            const attachmentSummary = await loadAttachmentSummaryText(app, userId, fileIds);

            if (!providedConversationId) {
                const conv = await app.prisma.conversation.create({
                    data: { userId, title: titleFromFirstUserMessage(promptText || displayInput) },
                    select: { id: true },
                });
                conversationId = conv.id;
            } else {
                const conv = await app.prisma.conversation.findFirst({
                    where: { id: providedConversationId, userId },
                    select: { id: true },
                });
                if (!conv) {
                    return reply
                        .code(404)
                        .send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
                }
                conversationId = providedConversationId;
            }

            const attachmentText = await loadTextAttachmentBlock(app, userId, conversationId, fileIds, {
                continue: wantsContinue,
            });
            const textForModel = [promptText, attachmentSummary, attachmentText].filter(Boolean).join("\n\n");
            if (!textForModel && imageParts.length === 0) {
                return reply
                    .code(400)
                    .send({ error: { code: "BAD_REQUEST", message: "消息不能为空" } });
            }

            const history = await app.prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: "asc" },
                select: { role: true, content: true },
            });

            await app.prisma.message.create({
                data: { conversationId, role: "user", content: displayInput },
            });
            const userContent: string | ChatContentPart[] =
                imageParts.length > 0
                    ? ([{ type: "text", text: textForModel }, ...imageParts] as ChatContentPart[])
                    : textForModel;

            const historyUserIds = history
                .filter((m: any) => m.role === "user")
                .flatMap((m: any) => extractFileIdsFromText(String(m.content || "")));
            const allHistoryIds = Array.from(
                new Set<number>(historyUserIds.map((x: any) => Number(x)).filter(isFiniteNumber))
            );
            const historyFiles = allHistoryIds.length
                ? await app.prisma.uploadedFile.findMany({
                    where: { id: { in: allHistoryIds }, userId },
                    select: { id: true, originalName: true, mime: true },
                })
                : [];
            const fileById = new Map<number, { originalName: string; mime: string }>(
                historyFiles.map((r: any) => [Number(r.id), { originalName: r.originalName, mime: r.mime }])
            );

            const messages: ChatMessage[] = [
                { role: "system", content: FILE_CONTEXT_SYSTEM_PROMPT },
                ...history.map((m: { role: string; content: string }) => ({
                    role: m.role as any,
                    content:
                        m.role === "user"
                            ? (() => {
                                const stripped = stripFileMarkdownLines(m.content);
                                if (stripped) return stripped;
                                const ids = extractFileIdsFromText(String(m.content || ""));
                                const rows = ids
                                    .map((id) => fileById.get(id))
                                    .filter(Boolean) as Array<{ originalName: string }>;
                                return buildAttachmentSummaryText(rows);
                            })()
                            : m.content,
                })),
                { role: "user" as const, content: userContent },
            ];

            const ac = new AbortController();
            const timeout = setTimeout(() => ac.abort(), getChatTimeoutMs());

            let answer = "";
            let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 };
            try {
                const r = await openRouterChatComplete({
                    model,
                    messages,
                    signal: ac.signal,
                });
                answer = r.content || "";
                usage = r.usage;

                // 调试：打印返回的token数据
                debugToken("OpenRouter返回的token数据", usage, { prefix: "🔄" });
            } finally {
                clearTimeout(timeout);
            }

            const assistant = await app.prisma.message.create({
                data: {
                    conversationId,
                    role: "assistant",
                    content: answer,
                    status: "completed",
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                    cost: usage.cost,
                },
                select: { id: true, role: true, content: true, createdAt: true },
            });

            // 调试：打印保存到数据库的消息数据
            debugDb("保存到数据库的消息", {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
                cost: usage.cost
            });

            await app.prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            });

            return reply.send({ conversationId, assistantMessage: assistant });
        } catch (err: any) {
            if (err?.name === "AbortError") {
                return reply
                    .code(504)
                    .send({ error: { code: "TIMEOUT", message: "请求超时，请重试" } });
            }
            const e = toPublicError(err);
            return reply.code(e.statusCode).send(e.body);
        }
    });

    // ---------------------------
    // 流式：POST /api/chat/stream
    // NDJSON:
    // meta/delta/error/done
    // ---------------------------
    app.post(
        "/stream",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            const userId = Number((request.user as any).id);
            if (!Number.isFinite(userId)) {
                return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
            }

            // 关键：确认 DB 里真的存在这个 user（避免外键 500）
            const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!user) {
                return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
            }

            try {
                const body = request.body as any;
                const displayInput = String(body?.message || "").trim();
                const promptText = stripFileMarkdownLines(String(body?.prompt ?? displayInput));
                const model = String(body?.model || "openai/gpt-4o-mini");
                const fileIds = Array.isArray(body?.fileIds) ? body.fileIds : [];
                const wantsContinue = isContinueMessage(promptText);
                let conversationId: number;
                const providedConversationId = body?.conversationId
                    ? Number(body.conversationId)
                    : undefined;

                if (wantsContinue && !providedConversationId) {
                    return reply
                        .code(400)
                        .send({ error: { code: "BAD_REQUEST", message: "“继续”需要在已有会话中使用：请在同一会话里发送“继续”。" } });
                }

                const imageParts = await loadImageParts(app, userId, fileIds);
                const attachmentSummary = await loadAttachmentSummaryText(app, userId, fileIds);

                // 1) 确认/创建会话
                if (!providedConversationId) {
                    const conv = await app.prisma.conversation.create({
                        data: { userId, title: titleFromFirstUserMessage(promptText || displayInput) },
                        select: { id: true },
                    });
                    conversationId = conv.id;
                } else {
                    const conv = await app.prisma.conversation.findFirst({
                        where: { id: providedConversationId, userId },
                        select: { id: true },
                    });
                    if (!conv) {
                        return reply
                            .code(404)
                            .send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
                    }
                    conversationId = providedConversationId;
                }

                const attachmentText = await loadTextAttachmentBlock(app, userId, conversationId, fileIds, {
                    continue: wantsContinue,
                });
                const textForModel = [promptText, attachmentSummary, attachmentText].filter(Boolean).join("\n\n");
                if (!textForModel && imageParts.length === 0) {
                    return reply
                        .code(400)
                        .send({ error: { code: "BAD_REQUEST", message: "消息不能为空" } });
                }

                // 2) 取历史
                const history = await app.prisma.message.findMany({
                    where: { conversationId },
                    orderBy: { createdAt: "asc" },
                    select: { role: true, content: true },
                });

                const historyUserIds = history
                    .filter((m: any) => m.role === "user")
                    .flatMap((m: any) => extractFileIdsFromText(String(m.content || "")));
                const allHistoryIds = Array.from(
                    new Set<number>(historyUserIds.map((x: any) => Number(x)).filter(isFiniteNumber))
                );
                const historyFiles = allHistoryIds.length
                    ? await app.prisma.uploadedFile.findMany({
                        where: { id: { in: allHistoryIds }, userId },
                        select: { id: true, originalName: true, mime: true },
                    })
                    : [];
                const fileById = new Map<number, { originalName: string; mime: string }>(
                    historyFiles.map((r: any) => [Number(r.id), { originalName: r.originalName, mime: r.mime }])
                );

                // 3) 写入 user 消息
                await app.prisma.message.create({
                    data: { conversationId, role: "user", content: displayInput },
                });

                // 4) 创建 assistant 空消息（streaming）
                const assistantRow = await app.prisma.message.create({
                    data: {
                        conversationId,
                        role: "assistant",
                        content: "",
                        status: "streaming",
                    },
                    select: { id: true },
                });

                const userContent: string | ChatContentPart[] =
                    imageParts.length > 0
                        ? ([{ type: "text", text: textForModel }, ...imageParts] as ChatContentPart[])
                        : textForModel;

                const messages: ChatMessage[] = [
                    { role: "system", content: FILE_CONTEXT_SYSTEM_PROMPT },
                    ...history.map((m: { role: string; content: string }) => ({
                        role: m.role as any,
                        content:
                            m.role === "user"
                                ? (() => {
                                    const stripped = stripFileMarkdownLines(m.content);
                                    if (stripped) return stripped;
                                    const ids = extractFileIdsFromText(String(m.content || ""));
                                    const rows = ids
                                        .map((id) => fileById.get(id))
                                        .filter(Boolean) as Array<{ originalName: string }>;
                                    return buildAttachmentSummaryText(rows);
                                })()
                                : m.content,
                    })),
                    { role: "user" as const, content: userContent },
                ];

                // 预估算token使用量（用于流式对话）
                const estimatedTokens = estimateConversationTokens(history, textForModel, model);
                debugToken("预估算token使用量", estimatedTokens);

                // 5) 发起 OpenRouter 流式请求
                const upstreamAbort = new AbortController();
                let closedByClient = false;
                let timedOut = false;

                // 前端断开连接（Stop/刷新/切路由）=> 中断上游
                reply.raw.on("close", () => {
                    closedByClient = true;
                    upstreamAbort.abort();
                });

                // 静默超时：只有在一段时间内没有收到任何上游数据时才中断
                const idleMs = getChatTimeoutMs();
                let idleTimer: any = null;
                const resetIdleTimeout = () => {
                    if (idleTimer) clearTimeout(idleTimer);
                    idleTimer = setTimeout(() => {
                        timedOut = true;
                        upstreamAbort.abort();
                    }, idleMs);
                };

                const upstream = await openRouterChatStream({
                    model,
                    messages,
                    signal: upstreamAbort.signal,
                });

                if (!upstream.ok || !upstream.body) {
                    const txt = await upstream.text().catch(() => "");
                    const err: any = new Error(
                        `OpenRouter 请求失败 (upstream.status){txt}`
                    );
                    err.statusCode = upstream.status;
                    err.code = "OPENROUTER_ERROR";

                    if (idleTimer) clearTimeout(idleTimer);

                    // 这里建议：保留 assistantRow 并标记 error（比 delete 更利于排查）
                    const e = toPublicError(err);
                    await app.prisma.message
                        .update({
                            where: { id: assistantRow.id },
                            data: {
                                status: "error",
                                error: e.body?.error?.message || "OpenRouter 请求失败",
                            },
                        })
                        .catch(() => { });

                    return reply.code(e.statusCode).send(e.body);
                }

                // 6) 开始向前端“边读边写”
                reply.raw.writeHead(200, {
                    "Content-Type": "application/x-ndjson; charset=utf-8",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });

                // meta
                reply.raw.write(
                    JSON.stringify({
                        type: "meta",
                        conversationId,
                        assistantMessageId: assistantRow.id,
                    }) + "\n"
                );

                reply.hijack();
                reply.raw.flushHeaders?.();
                reply.raw.socket?.setNoDelay?.(true);

                const reader = upstream.body.getReader();
                const decoder = new TextDecoder();

                let buf = "";
                let fullText = "";
                let doneReceived = false;

                // 如果中途出错/超时，我们会给前端发一条 error NDJSON（如果连接还在）
                let streamError: NDJSONError | null = null;

                // 只要开始进入读取循环，就启动静默超时计时器
                resetIdleTimeout();

                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;

                        // 收到任何数据就刷新静默超时
                        resetIdleTimeout();

                        buf += decoder.decode(value, { stream: true });

                        // SSE：按行处理
                        const lines = buf.split("\n");
                        buf = lines.pop() || "";

                        for (const line of lines) {
                            const s = line.trim();
                            if (!s.startsWith("data:")) continue;

                            const payload = s.slice(5).trim();
                            if (!payload) continue;
                            if (payload === "[DONE]") {
                                doneReceived = true;
                                break;
                            }

                            try {
                                const json = JSON.parse(payload);
                                const delta = json?.choices?.[0]?.delta?.content;
                                if (typeof delta === "string" && delta.length) {
                                    fullText += delta;

                                    // 连接已断开就别写了（避免抛错）
                                    if (!reply.raw.writableEnded) {
                                        reply.raw.write(
                                            JSON.stringify({ type: "delta", text: delta }) + "\n"
                                        );
                                    }
                                }
                            } catch {
                                // ignore
                            }
                        }

                        if (doneReceived) break;
                    }
                } catch (err: any) {
                    // reader.read() 在 abort 时可能抛 AbortError
                    if (timedOut) {
                        streamError = { code: "TIMEOUT", message: "请求超时，请重试" };
                    } else if (!closedByClient) {
                        streamError = {
                            code: "STREAM_ERROR",
                            message: "生成中断，请重试",
                        };
                    }
                } finally {
                    if (idleTimer) clearTimeout(idleTimer);

                    // 7) 根据结果落库：completed/stopped/error
                    const finalStatus = closedByClient
                        ? "stopped"
                        : streamError
                            ? "error"
                            : "completed";

                    const finalError =
                        finalStatus === "error" ? streamError?.message || "生成失败" : null;

                    // 使用预估算的token数据更新消息
                    const tokenData =
                        finalStatus === "completed"
                            ? estimateChatUsage(history, textForModel, fullText, model)
                            : {};

                    if (finalStatus === "completed") {
                        const promptTokens = Number((tokenData as any).promptTokens || 0);
                        const completionTokens = Number((tokenData as any).completionTokens || 0);
                        const cost = await calculateUsdCost(model, { promptTokens, completionTokens });
                        (tokenData as any).cost = cost;
                        (tokenData as any).estimated = true;
                    }

                    await app.prisma.message
                        .update({
                            where: { id: assistantRow.id },
                            data: {
                                content: fullText,
                                status: finalStatus,
                                error: finalError,
                                ...tokenData, // 只在完成时添加token数据
                            },
                        })
                        .catch(() => { });

                    await app.prisma.conversation
                        .update({
                            where: { id: conversationId! },
                            data: { updatedAt: new Date() },
                        })
                        .catch(() => { });

                    // 8) 尝试给前端发 error + done（如果连接没断）
                    try {
                        if (!reply.raw.writableEnded) {
                            if (streamError) {
                                reply.raw.write(
                                    JSON.stringify({ type: "error", error: streamError }) + "\n"
                                );
                            }
                            reply.raw.write(JSON.stringify({ type: "done" }) + "\n");
                            reply.raw.end();
                        }
                    } catch {
                        // ignore
                    }
                }
            } catch (err: any) {
                // 流式响应一旦 writeHead/hijack 之后，就不能再用 reply.send()。
                // 否则会触发 FST_ERR_REP_ALREADY_SENT。
                if (reply.raw.headersSent || reply.raw.writableEnded) {
                    // 尽量给前端发出 error/done，并结束连接（避免前端一直 pending）
                    try {
                        if (!reply.raw.writableEnded) {
                            reply.raw.write(
                                JSON.stringify({
                                    type: "error",
                                    error: { code: "STREAM_ERROR", message: "生成中断，请重试" },
                                }) + "\n"
                            );
                            reply.raw.write(JSON.stringify({ type: "done" }) + "\n");
                            reply.raw.end();
                        }
                    } catch {
                        // ignore
                    }
                    return;
                }
                if (err?.name === "AbortError") {
                    return reply
                        .code(504)
                        .send({ error: { code: "TIMEOUT", message: "请求超时，请重试" } });
                }
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );
};

export default routes;