import type { FastifyPluginAsync } from "fastify";
import { toPublicError } from "../utils/errors";

const routes: FastifyPluginAsync = async (app) => {
    // 列表
    app.get(
        "/",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            try {
                const userId = Number((request.user as any).id);
                if (!Number.isFinite(userId)) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                // 关键：确认 DB 里真的存在这个 user（避免外键 500）
                const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                const list = await app.prisma.conversation.findMany({
                    where: { userId },
                    orderBy: { updatedAt: "desc" },
                    select: { id: true, title: true, createdAt: true, updatedAt: true },
                });

                return reply.send({ conversations: list });
            } catch (err) {
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );

    // 新建会话
    app.post(
        "/",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            try {
                const userId = Number((request.user as any).id);
                if (!Number.isFinite(userId)) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                // 关键：确认 DB 里真的存在这个 user（避免外键 500）
                const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }
                const body = request.body as any;
                const title = String(body?.title || "New Chat").slice(0, 80);

                const conv = await app.prisma.conversation.create({
                    data: { userId, title },
                    select: { id: true, title: true, createdAt: true, updatedAt: true },
                });

                return reply.send({ conversation: conv });
            } catch (err) {
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );

    // 重命名
    app.patch(
        "/:id",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            try {
                const userId = Number((request.user as any).id);
                if (!Number.isFinite(userId)) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                // 关键：确认 DB 里真的存在这个 user（避免外键 500）
                const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }
                const id = Number((request.params as any).id);
                const body = request.body as any;
                const title = String(body?.title || "").trim().slice(0, 80);

                if (!title) {
                    return reply
                        .code(400)
                        .send({ error: { code: "BAD_REQUEST", message: "标题不能为空" } });
                }

                // 防止改别人会话
                const conv = await app.prisma.conversation.findFirst({
                    where: { id, userId },
                });
                if (!conv) {
                    return reply
                        .code(404)
                        .send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
                }

                const updated = await app.prisma.conversation.update({
                    where: { id },
                    data: { title },
                    select: { id: true, title: true, createdAt: true, updatedAt: true },
                });

                return reply.send({ conversation: updated });
            } catch (err) {
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );

    // 删除会话（会连同消息一起删：用 prisma 事务）
    app.delete(
        "/:id",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            try {
                const userId = Number((request.user as any).id);
                if (!Number.isFinite(userId)) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                // 关键：确认 DB 里真的存在这个 user（避免外键 500）
                const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }
                const id = Number((request.params as any).id);

                const conv = await app.prisma.conversation.findFirst({
                    where: { id, userId },
                });
                if (!conv) {
                    return reply
                        .code(404)
                        .send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
                }

                await app.prisma.$transaction([
                    app.prisma.message.deleteMany({ where: { conversationId: id } }),
                    app.prisma.conversation.delete({ where: { id } }),
                ]);

                return reply.send({ ok: true });
            } catch (err) {
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );

    // 加载某会话消息
    app.get(
        "/:id/messages",
        { preHandler: [app.authenticate] },
        async (request, reply) => {
            try {
                const userId = Number((request.user as any).id);
                if (!Number.isFinite(userId)) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }

                // 关键：确认 DB 里真的存在这个 user（避免外键 500）
                const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user) {
                    return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
                }
                const id = Number((request.params as any).id);

                const conv = await app.prisma.conversation.findFirst({
                    where: { id, userId },
                    select: { id: true },
                });
                if (!conv) {
                    return reply
                        .code(404)
                        .send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
                }

                const messages = await app.prisma.message.findMany({
                    where: { conversationId: id },
                    orderBy: { createdAt: "asc" },
                    select: { id: true, role: true, content: true, createdAt: true },
                });

                return reply.send({ messages });
            } catch (err) {
                const e = toPublicError(err);
                return reply.code(e.statusCode).send(e.body);
            }
        }
    );
};

export default routes;