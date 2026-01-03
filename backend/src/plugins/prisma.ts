import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

export default fp(async (app) => {
  const prisma = new PrismaClient();

  await prisma.$connect();

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});

// 给 TypeScript 一个类型提示
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
