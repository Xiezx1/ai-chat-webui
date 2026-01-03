import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";

type JwtUser = { id: number; username: string; isAdmin: boolean };

export default fp(async (app) => {
  await app.register(cookie);

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "dev-secret",
    cookie: {
      cookieName: "token",
      signed: false,
    },
  });

  app.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "请先登录" } });
    }
  });

  // 统一提供 cookie 配置（本地/线上可以切换）
  app.decorate("getAuthCookieOptions", () => {
    const secure = process.env.COOKIE_SECURE === "true";
    return {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      // 7天有效
      maxAge: 60 * 60 * 24 * 7,
    };
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
    getAuthCookieOptions: () => {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      path: string;
      maxAge: number;
    };
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}
