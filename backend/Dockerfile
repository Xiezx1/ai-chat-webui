# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 安装 prisma 客户端需要的二进制文件
RUN apk add --no-cache openssl

# 复制 package 文件
COPY package*.json ./

# 安装依赖（包括 prisma generate）
RUN npm ci --only=production

# 复制源代码
COPY . .

# 生成 Prisma 客户端
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 生产阶段
FROM node:18-alpine

WORKDIR /app

# 安装运行时需要的包
RUN apk add --no-cache openssl

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --only=production

# 复制构建产物和 prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fastify -u 1001

USER fastify

EXPOSE 3000

CMD ["node", "dist/app.js"]