import type { FastifyPluginAsync } from "fastify";
import {
    openRouterChatComplete,
    openRouterChatStream,
} from "../providers/openrouter";
import { toPublicError } from "../utils/errors";
import { debugToken, debugDb } from "../utils/debug";
import { estimateConversationTokens } from "../utils/tokenEstimator";
import { estimateChatUsage } from "../utils/tokenEstimator";
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
            const input = String(body?.message || "").trim();
            const model = String(body?.model || "openai/gpt-4o-mini");
            let conversationId: number;
            const providedConversationId = body?.conversationId ? Number(body.conversationId) : undefined;

            if (!input) {
                return reply
                    .code(400)
                    .send({ error: { code: "BAD_REQUEST", message: "消息不能为空" } });
            }

            if (!providedConversationId) {
                const conv = await app.prisma.conversation.create({
                    data: { userId, title: titleFromFirstUserMessage(input) },
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

            const history = await app.prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: "asc" },
                select: { role: true, content: true },
            });

            await app.prisma.message.create({
                data: { conversationId, role: "user", content: input },
            });

            const messages = [
                ...history.map((m: { role: string; content: string }) => ({ role: m.role as any, content: m.content })),
                { role: "user" as const, content: input },
            ];

            const ac = new AbortController();
            const timeout = setTimeout(() => ac.abort(), 60_000);

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
                const input = String(body?.message || "").trim();
                const model = String(body?.model || "openai/gpt-4o-mini");
                let conversationId: number;
                const providedConversationId = body?.conversationId
                    ? Number(body.conversationId)
                    : undefined;

                if (!input) {
                    return reply
                        .code(400)
                        .send({ error: { code: "BAD_REQUEST", message: "消息不能为空" } });
                }

                // 1) 确认/创建会话
                if (!providedConversationId) {
                    const conv = await app.prisma.conversation.create({
                        data: { userId, title: titleFromFirstUserMessage(input) },
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

                // 2) 取历史
                const history = await app.prisma.message.findMany({
                    where: { conversationId },
                    orderBy: { createdAt: "asc" },
                    select: { role: true, content: true },
                });

                // 3) 写入 user 消息
                await app.prisma.message.create({
                    data: { conversationId, role: "user", content: input },
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

                const messages = [
                    ...history.map((m: { role: string; content: string }) => ({ role: m.role as any, content: m.content })),
                    { role: "user" as const, content: input },
                ];

                // 预估算token使用量（用于流式对话）
                const estimatedTokens = estimateConversationTokens(history, input, model);
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

                // 超时 => 中断上游
                const timeout = setTimeout(() => {
                    timedOut = true;
                    upstreamAbort.abort();
                }, 60_000);

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

                    clearTimeout(timeout);

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

                // 如果中途出错/超时，我们会给前端发一条 error NDJSON（如果连接还在）
                let streamError: NDJSONError | null = null;

                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;

                        buf += decoder.decode(value, { stream: true });

                        // SSE：按行处理
                        const lines = buf.split("\n");
                        buf = lines.pop() || "";

                        for (const line of lines) {
                            const s = line.trim();
                            if (!s.startsWith("data:")) continue;

                            const payload = s.slice(5).trim();
                            if (!payload) continue;
                            if (payload === "[DONE]") continue;

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
                    clearTimeout(timeout);

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
                            ? estimateChatUsage(history, input, fullText, model)
                            : {};

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