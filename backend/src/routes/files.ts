import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { toPublicError } from "../utils/errors";
import { UPLOAD_DIR } from "../utils/uploads";

const MAX_FILE_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024); // 25MB

function safeBaseName(name: string) {
  const base = path.basename(name || "file");
  return base.replace(/[\\/\0<>:"|?*]/g, "_").slice(0, 180) || "file";
}

function isProbablyImage(mime: string) {
  return typeof mime === "string" && mime.startsWith("image/");
}

const routes: FastifyPluginAsync = async (app) => {
  // 上传文件（必须登录）
  app.post(
    "/",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const userId = Number((request.user as any).id);
        if (!Number.isFinite(userId)) {
          return reply
            .code(401)
            .send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
        }

        const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) {
          return reply
            .code(401)
            .send({ error: { code: "UNAUTHORIZED", message: "登录已失效，请重新登录" } });
        }

        const file = await (request as any).file?.({ limits: { fileSize: MAX_FILE_BYTES } });
        if (!file) {
          return reply
            .code(400)
            .send({ error: { code: "BAD_REQUEST", message: "未找到上传文件" } });
        }

        const originalName = safeBaseName(file.filename);
        const mime = String(file.mimetype || "application/octet-stream");
        const storedName = `${randomUUID()}-${originalName}`;

        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        const storedPath = path.join(UPLOAD_DIR, storedName);

        // 直接把流写入磁盘
        await pipeline(file.file, createWriteStream(storedPath));

        const stat = await fs.stat(storedPath);

        const row = await app.prisma.uploadedFile.create({
          data: {
            userId,
            storedName,
            originalName,
            mime,
            size: stat.size,
          },
          select: {
            id: true,
            originalName: true,
            mime: true,
            size: true,
            createdAt: true,
          },
        });

        return reply.send({
          file: {
            ...row,
            kind: isProbablyImage(mime) ? "image" : "file",
            rawUrl: `/api/files/${row.id}/raw`,
            downloadUrl: `/api/files/${row.id}/download`,
          },
        });
      } catch (err: any) {
        // fastify multipart 超限会抛错
        if (err?.code === "FST_REQ_FILE_TOO_LARGE") {
          return reply
            .code(413)
            .send({ error: { code: "FILE_TOO_LARGE", message: "文件过大" } });
        }
        const e = toPublicError(err);
        return reply.code(e.statusCode).send(e.body);
      }
    }
  );

  // 读取原始文件（必须登录 + 只能读自己的）
  app.get(
    "/:id/raw",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const userId = Number((request.user as any).id);
        const id = Number((request.params as any).id);
        if (!Number.isFinite(userId) || !Number.isFinite(id)) {
          return reply
            .code(400)
            .send({ error: { code: "BAD_REQUEST", message: "参数无效" } });
        }

        const row = await app.prisma.uploadedFile.findFirst({
          where: { id, userId },
          select: { storedName: true, originalName: true, mime: true },
        });
        if (!row) {
          return reply
            .code(404)
            .send({ error: { code: "NOT_FOUND", message: "文件不存在" } });
        }

        const storedPath = path.join(UPLOAD_DIR, row.storedName);
        reply.header("Content-Type", row.mime || "application/octet-stream");
        reply.header("Cache-Control", "private, max-age=0, no-store");
        return reply.send(createReadStream(storedPath));
      } catch (err) {
        const e = toPublicError(err);
        return reply.code(e.statusCode).send(e.body);
      }
    }
  );

  // 下载（attachment）
  app.get(
    "/:id/download",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const userId = Number((request.user as any).id);
        const id = Number((request.params as any).id);
        if (!Number.isFinite(userId) || !Number.isFinite(id)) {
          return reply
            .code(400)
            .send({ error: { code: "BAD_REQUEST", message: "参数无效" } });
        }

        const row = await app.prisma.uploadedFile.findFirst({
          where: { id, userId },
          select: { storedName: true, originalName: true, mime: true },
        });
        if (!row) {
          return reply
            .code(404)
            .send({ error: { code: "NOT_FOUND", message: "文件不存在" } });
        }

        const storedPath = path.join(UPLOAD_DIR, row.storedName);
        reply.header("Content-Type", row.mime || "application/octet-stream");
        reply.header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName || "download")}`
        );
        reply.header("Cache-Control", "private, max-age=0, no-store");
        return reply.send(createReadStream(storedPath));
      } catch (err) {
        const e = toPublicError(err);
        return reply.code(e.statusCode).send(e.body);
      }
    }
  );
};

export default routes;
