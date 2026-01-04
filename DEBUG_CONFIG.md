# 调试模式配置说明

## 概述

本项目现在支持统一的调试日志控制机制，可以通过环境变量轻松开启或关闭调试日志输出。

## 后端调试控制

### 环境变量

| 变量名 | 值 | 说明 |
|--------|----|----|
| `DEBUG` | `true` | 开启调试模式（默认在非生产环境自动开启） |
| `NODE_ENV` | `production` | 设置为生产环境会自动关闭调试模式 |

### 使用方法

1. **开发环境**：调试模式默认开启
2. **生产环境**：设置 `NODE_ENV=production` 关闭调试
3. **强制开启**：即使在生产环境，也可以设置 `DEBUG=true` 开启调试

### 示例

```bash
# 开发环境（默认开启调试）
npm run dev

# 生产环境（自动关闭调试）
NODE_ENV=production npm start

# 强制开启调试
DEBUG=true NODE_ENV=production npm start
```

## 前端调试控制

### 环境变量

| 变量名 | 值 | 说明 |
|--------|----|----|
| `VITE_DEBUG` | `true` | 强制开启前端调试模式 |
| 开发模式 | - | 开发环境（`npm run dev`）默认开启调试 |

### 使用方法

1. **开发环境**：调试模式默认开启
2. **生产环境**：需要设置 `VITE_DEBUG=true` 开启调试

### 示例

```bash
# 开发环境（默认开启调试）
npm run dev

# 生产构建并开启调试
VITE_DEBUG=true npm run build

# 仅构建（关闭调试）
npm run build
```

## 调试日志类型

### 后端日志类型

- 🔍 **API调试** (`debugApi`): API请求/响应数据
- 📊 **Token调试** (`debugToken`): Token使用情况和费用计算
- 💾 **数据库调试** (`debugDb`): 数据库操作和保存的数据
- ✅ **成功日志** (`debugSuccess`): 操作成功确认
- ⚠️ **警告日志** (`debugWarn`): 警告信息
- ❌ **错误日志** (`debugError`): 错误信息

### 前端日志类型

- 🖥️ **UI调试** (`debugUi`): 界面相关数据和计算
- 📊 **Token调试** (`debugToken`): Token统计和进度条计算
- 🏪 **Store调试** (`debugStore`): Pinia状态管理相关
- ✅ **成功日志** (`debugSuccess`): 操作成功确认
- ⚠️ **警告日志** (`debugWarn`): 警告信息
- ❌ **错误日志** (`debugError`): 错误信息

## 调试信息说明

### Token统计流程调试

1. **API响应** (`debugApi`): 记录OpenRouter返回的完整数据
2. **Token提取** (`debugToken`): 记录提取的usage数据
3. **费用计算** (`debugToken`): 记录计算出的费用
4. **数据库保存** (`debugDb`): 记录保存到数据库的消息
5. **前端计算** (`debugToken`): 记录前端的统计计算结果

### 常用调试命令

```bash
# 查看token调试日志
DEBUG=true npm run dev | grep "📊"

# 查看API调试日志
DEBUG=true npm run dev | grep "🌐"

# 查看前端调试日志（浏览器控制台）
# 在浏览器开发者工具的控制台中查看带前缀的日志
```

## 生产环境建议

1. **生产环境默认关闭调试**，避免过多日志输出
2. **如需排查问题**，可以临时开启 `DEBUG=true`
3. **前端调试**：生产环境需要单独设置 `VITE_DEBUG=true`
4. **日志清理**：部署前确保关闭调试模式

## 调试开关状态检查

可以通过以下方式检查调试模式是否开启：

- 后端：访问 `/health` 端点查看服务器状态
- 前端：在浏览器控制台执行 `console.log(import.meta.env.DEV, import.meta.env.VITE_DEBUG)`