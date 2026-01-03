# AI Chat WebUI

一个简洁的AI聊天Web应用，支持流式对话、Markdown渲染和用户管理。

## 🚀 快速开始

### 开发环境启动

**1. 启动后端服务**
```bash
cd backend
npm install
npm run dev
```
后端将在 http://localhost:3000 启动

**2. 启动前端服务**
```bash
cd frontend
npm install
npm run dev
```
前端将在 http://localhost:5173 启动

**3. 创建管理员用户**
```bash
cd backend
npm run user:create -- --username admin --password 123456 --admin
```

**4. 访问应用**
打开浏览器访问 http://localhost:5173，使用 admin/123456 登录

### 生产环境部署（Docker）

**1. 准备环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，设置你的 OPENROUTER_API_KEY
```

**2. 启动所有服务**
```bash
docker-compose up -d
```

**3. 访问应用**
- 本地访问：http://localhost
- HTTPS访问：配置域名后使用 https://your-domain.com

## ✨ 功能特性

- 🔐 **安全登录** - HttpOnly Cookie + JWT 鉴权
- 💬 **流式对话** - 支持实时流式输出和停止生成
- 📝 **Markdown渲染** - 支持代码高亮和复制功能
- 🗂️ **会话管理** - 创建、重命名、删除会话
- 🎨 **简洁UI** - ChatGPT风格的清爽界面
- ⚠️ **错误处理** - 友好的错误提示和重试机制
- 📱 **响应式设计** - 适配桌面和移动端

## 🛠️ 技术栈

### 前端
- Vue 3 + Composition API
- Vite 构建工具
- Tailwind CSS
- Vue Router 4
- Pinia 状态管理
- Markdown-it + highlight.js

### 后端
- Node.js + Fastify
- Prisma + SQLite
- JWT 认证
- OpenRouter API 集成

## 📁 项目结构

```
ai-chat-webui/
├── frontend/                 # Vue.js 前端应用
│   ├── src/
│   │   ├── components/       # 可复用组件
│   │   ├── pages/           # 页面组件
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── services/        # API 服务
│   │   └── utils/           # 工具函数
│   └── Dockerfile           # 前端 Docker 配置
├── backend/                  # Node.js 后端服务
│   ├── src/
│   │   ├── routes/          # API 路由
│   │   ├── plugins/         # Fastify 插件
│   │   ├── providers/       # 第三方服务集成
│   │   └── scripts/         # 脚本文件
│   ├── prisma/              # 数据库配置
│   └── Dockerfile           # 后端 Docker 配置
├── docker-compose.yml        # Docker Compose 配置
├── Caddyfile                 # Caddy 反向代理配置
└── .env.example             # 环境变量模板
```

## 🔧 配置说明

### 环境变量

复制 `.env.example` 到 `.env` 并配置以下变量：

```bash
# 必需配置
JWT_SECRET=your-super-long-random-jwt-secret
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-api-key

# 可选配置
DOMAIN=your-domain.com
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost
```

### OpenRouter 配置

1. 访问 [OpenRouter](https://openrouter.ai) 注册账号
2. 获取 API Key
3. 在 `.env` 文件中配置 `OPENROUTER_API_KEY`

## 🚀 部署指南

### 本地开发
```bash
# 克隆项目
git clone <your-repo-url>
cd ai-chat-webui

# 安装依赖并启动
cd backend && npm install && npm run dev
cd ../frontend && npm install && npm run dev
```

### Docker 生产部署
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 云服务器部署
1. 安装 Docker 和 Docker Compose
2. 上传项目文件到服务器
3. 配置 `.env` 文件
4. 运行 `docker-compose up -d`

## 🔍 故障排除

### 常见问题

**1. 端口占用**
```bash
# 查看端口占用
lsof -i :3000
lsof -i :5173

# 杀死进程
kill -9 <PID>
```

**2. 数据库问题**
```bash
cd backend
rm -f prisma/dev.db
npx prisma migrate reset
```

**3. 依赖安装失败**
```bash
rm -rf node_modules package-lock.json
npm install
```

### 日志查看

**Docker 部署**
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

**本地开发**
```bash
# 后端日志
cd backend && npm run dev

# 前端日志
cd frontend && npm run dev
```

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🆘 支持

如果遇到问题，请：

1. 查看本文档的故障排除部分
2. 检查 [Issues](https://github.com/your-username/ai-chat-webui/issues) 页面
3. 创建新的 Issue 描述问题

---

**Happy Chatting! 🎉**