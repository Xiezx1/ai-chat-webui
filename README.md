# AI Chat WebUI

一个简洁的AI聊天Web应用，支持流式对话、Markdown渲染和用户管理。

## 🚀 快速开始

### 开发环境启动

### ✅ 后端环境变量（Windows/无 Docker）

后端通过 `dotenv` 自动读取“当前工作目录”的 `.env` 文件。
本地开发建议把环境变量放在 `backend/.env`（你在 `backend` 目录里运行 `npm run dev` 时会自动生效）。

在项目根目录执行（任选其一）：

- PowerShell：`Copy-Item .\.env.example .\backend\.env`
- CMD：`copy .env.example backend\.env`

然后编辑 `backend/.env`，至少设置：

```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET=dev-change-this-to-a-long-random-string
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-api-key-here
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost

# 可选：聊天请求超时（毫秒），默认 300000（5 分钟）。
# 流式接口使用“静默超时”：只有在连续一段时间没有收到上游数据时才会超时；
# 只要模型仍在持续输出（持续有数据返回），就不会因为超时中断。
# 如果“回答生成一半就超时”，可以适当调大，比如 600000。
# CHAT_TIMEOUT_MS=300000

# 可选：上传文件大小限制（字节），默认 25MB
# MAX_UPLOAD_BYTES=26214400
# 可选：多模态图片总大小限制（字节），默认 8MB
# MAX_IMAGE_BYTES=8388608

# 可选：文本类附件（PDF/DOCX/TXT 等）抽取上限，用于让模型“读文件”
# 默认会把抽取的正文以【附件内容：文件名】块追加到 prompt（超出会截断）
# MAX_TEXT_ATTACHMENTS=5
# MAX_TEXT_ATTACHMENT_CHARS=220000
# MAX_TEXT_ATTACHMENT_CHARS_PER_FILE=80000

# 可选：当附件内容太长被截断时，你可以在同一会话里发送“继续”，
# 后端会按游标自动续读该附件的后半段并继续喂给模型。
```

**1. 启动后端服务**
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
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

1. 访问 [OpenRouter](https://api.x1zx.com) 注册账号
2. 获取 API Key
3. 在 `.env` 文件中配置 `OPENROUTER_API_KEY`

## 📎 文件上传与多模态图片

- 输入框支持“上传任意文件”和“粘贴图片/截图”。
- 任意文件：上传成功后会自动在输入框插入下载链接。
- 图片文件：上传成功后会自动插入图片 Markdown；发送时会把图片以多模态（image）一并发给模型。
- 文件访问：必须登录后才能访问（同源 Cookie 鉴权）。

注意：只有支持 Vision/多模态的模型才能正确处理图片；若模型不支持，OpenRouter 可能返回错误。

## 📄 文本附件续读（继续）

- 当 PDF/DOCX/TXT 内容过长时，后端会按长度分段抽取并追加到 prompt（超出会显示“内容已截断”）。
- 你可以在同一会话里直接发送：`继续`（或 `continue` / `next`），后端会从上次位置续读下一段并继续回答。

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
# Windows PowerShell 可能禁用 npx.ps1，可用：
./node_modules/.bin/prisma.cmd migrate reset --force
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

【现有已实现功能】
- 用户认证系统：支持用户名/密码登录，基于JWT + HttpOnly Cookie的安全认证机制；备注：基础安全功能，用户访问控制

- 流式对话交互：支持实时流式输出，用户可中途停止生成，提供流畅的对话体验；备注：核心功能，体验优秀

- 多轮连续对话：基于上下文理解用户需求，支持连贯的多轮对话交互，无需重复输入背景信息；备注：核心AI能力，保持对话连贯性

- 会话管理：创建、重命名、删除会话，支持多个并行对话会话管理；备注：基础会话组织功能

- Markdown渲染：支持富文本Markdown渲染，包含代码高亮显示和语法着色；备注：提升内容可读性，技术文档友好

- 消息复制功能：一键复制AI回复内容，支持代码块单独复制；备注：提升使用便利性

- 响应式UI设计：适配桌面和移动端，ChatGPT风格的清爽界面设计；备注：跨设备用户体验

- 自动滚动优化：新消息自动滚动到底部，智能定位最新内容；备注：交互体验优化

- 错误处理机制：友好的错误提示，支持重试机制，提升系统稳定性；备注：提升系统健壮性

- 键盘快捷操作：Enter发送消息，Shift+Enter换行，提升输入效率；备注：提升操作效率

- 会话自动命名：基于首条用户消息自动生成会话标题，提升会话识别度；备注：智能化体验

【需补充的功能（目标：与ChatGPT WebUI核心体验一致）】

- 对话历史搜索：在历史会话中快速搜索关键词，支持按时间、标题、内容搜索定位过往对话；对应ChatGPT WebUI核心体验点：历史会话快速检索体验，帮助用户快速定位过往对话内容，提升历史管理效率；实现优先级建议：高优先级：ChatGPT核心高频功能

- 深色/浅色主题切换：支持明暗主题无缝切换，适应不同使用场景和用户偏好；对应ChatGPT WebUI核心体验点：护眼模式和个性化体验，适应不同光照环境和使用习惯；实现优先级建议：高优先级：基础用户体验功能

- 系统设置页面：模型选择、参数调整（温度、最大长度等）、API配置等设置选项；对应ChatGPT WebUI核心体验点：个性化AI对话配置，满足不同场景下的AI参数调优需求；实现优先级建议：高优先级：核心配置功能

- 会话导出功能：支持导出对话为Markdown、PDF、JSON等格式，便于备份和分享；对应ChatGPT WebUI核心体验点：对话内容备份和分享需求，满足知识管理和协作场景；实现优先级建议：高优先级：ChatGPT核心功能

- 消息重新生成：支持重新生成AI回复，可基于原提示词或修改后重新生成；对应ChatGPT WebUI核心体验点：对话质量优化，允许用户重新获取更满意的AI回答；实现优先级建议：高优先级：提升对话质量

- 对话分享功能：生成对话链接，支持公开或私有分享对话内容；对应ChatGPT WebUI核心体验点：知识分享和协作需求，便于团队交流和问题讨论；实现优先级建议：中优先级：社交协作功能

- 文件上传功能：支持上传图片、文档等文件，AI可基于上传内容进行对话；对应ChatGPT WebUI核心体验点：多模态交互体验，扩展AI应用场景，支持文档分析和图像理解；实现优先级建议：高优先级：扩展AI能力边界

- 高级快捷键：完整的键盘快捷键体系：新建会话、停止生成、搜索、设置等；对应ChatGPT WebUI核心体验点：提升操作效率，适合重度用户高频使用场景；实现优先级建议：中优先级：效率提升功能

- 对话分类标签：为会话添加自定义标签，支持按标签分类管理对话；对应ChatGPT WebUI核心体验点：对话内容组织管理，便于知识分类和快速定位；实现优先级建议：中优先级：内容组织功能

- 语音输入功能：支持语音转文字输入，提升输入便利性和多场景适用性；对应ChatGPT WebUI核心体验点：多样化输入方式，适合移动端和语音交互场景；实现优先级建议：低优先级：锦上添花功能

- 消息编辑功能：支持编辑已发送的用户消息，基于编辑后的内容重新生成AI回复；对应ChatGPT WebUI核心体验点：对话修正和优化，允许用户完善问题描述获得更好回答；实现优先级建议：高优先级：对话优化功能

- 代码解释器：内置代码运行环境，支持Python等语言代码执行和结果展示；对应ChatGPT WebUI核心体验点：扩展AI编程能力，提供交互式代码开发和测试环境；实现优先级建议：中优先级：专业用户需求

- 插件系统：支持第三方插件扩展，集成外部工具和服务；对应ChatGPT WebUI核心体验点：生态扩展能力，连接更多外部服务和工具；实现优先级建议：低优先级：长期规划功能

- 团队协作功能：支持多用户协作，权限管理，共享对话空间；对应ChatGPT WebUI核心体验点：企业级团队协作需求，支持项目管理和知识共享；实现优先级建议：低优先级