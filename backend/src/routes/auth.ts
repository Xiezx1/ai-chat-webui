import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";

const authRoutes: FastifyPluginAsync = async (app) => {
  // 登录
  app.post("/login", async (request, reply) => {
    const body = request.body as any;
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "请输入用户名和密码" } });
    }

    const user = await app.prisma.user.findUnique({ where: { username } });
    if (!user) {
      return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "用户名或密码不正确" } });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "用户名或密码不正确" } });
    }

    const token = await reply.jwtSign({ id: user.id, username: user.username, isAdmin: user.isAdmin });

    reply.setCookie("token", token, app.getAuthCookieOptions());

    return reply.send({
      user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    });
  });

  // 登出
  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("token", { path: "/" });
    return reply.send({ ok: true });
  });

  // 当前用户
  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const u = request.user;
    return reply.send({ user: u });
  });
};

export default authRoutes;
