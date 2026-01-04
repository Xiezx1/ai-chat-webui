import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";

import prismaPlugin from "./plugins/prisma";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import conversationsRoutes from "./routes/conversations";
import chatRoutes from "./routes/chat";
import modelsRoutes from "./routes/models";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => {
    return { ok: true, ts: Date.now() };
  });

  // Auth API
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(conversationsRoutes, { prefix: "/api/conversations" });
  await app.register(chatRoutes, { prefix: "/api/chat" });
  await app.register(modelsRoutes, { prefix: "/api/models" });
  const port = Number(process.env.PORT || 3000);
  const host = "0.0.0.0";

  await app.listen({ port, host });
  app.log.info(`Server listening on http://host:{port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
