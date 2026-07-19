# Webhook 转发中心

一个**通用的自定义 Webhook 转发中心**：外部系统以任意 HTTP 方法请求 `/wh/:subpath`，服务按端点契约完成**方法匹配 → 请求体解析 → 通用 HMAC-SHA-256 验签 → 转发投递**，可将事件转发为**邮件**（Gmail / QQ / 163 等）或**出站 HTTP 请求**（转发到第三方）。附带一套简洁现代的管理台（shadcn/ui）。

> 先回 `200 Accepted` 再异步转发；成功接收 ≠ 成功送达，失败会记录到转发日志。

---

## ✨ 特性

- **任意方法接入**：每个子路径可声明允许的方法（`POST` / `GET` / … 或 `*` 任意）。
- **自定义体解析**：负载来源可选 body / query / header，内容类型 json / form / text / raw，并可用 **dot-path** 字段映射把任意入站结构归一为命名变量。
- **通用 HMAC-SHA-256 验签**：可配置签名头、编码方案（hex / base64 / prefix / scheme）、被签数据（raw-body / raw-body+ts / query / header）、算法与防重放容差；常量时间比较。兼容 GitHub `X-Hub-Signature-256`、通用 `X-Signature` 等。
- **可插拔转发通道**（`ForwardChannel` 抽象）：
  - **Email**：nodemailer + SMTP，内置 Gmail / QQ / 163 预设（465 SSL），主题/正文支持 `{{变量}}` 模板。
  - **HTTP**：dot-path 抽取 + 模板 body + 自定义 method/headers/contentType，出站鉴权 none / bearer / basic / **HMAC 反向签名**，超时 + 指数退避重试。
  - 预留 Phone / WS。
- **可插拔持久化**：默认 **SQLite**（`bun:sqlite`，零配置），可选 **PostgreSQL**（`postgres.js`），由 `DATABASE_URL` 决定，业务层与方言解耦。
- **安全**：授权码 / 密钥 **AES-256-GCM** 加密存储，管理员口令 scrypt 哈希，签名 Cookie 会话，出库脱敏。
- **管理台**：仪表盘（统计 + 日志）、子路径 CRUD（渠道自适应表单）、邮箱账号管理。

---

## 🧱 技术栈

| 层              | 技术                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| 运行时 / 包管理 | Bun + Bun Workspace                                                                     |
| 前端            | Vite 7 · React 19 · TypeScript · Tailwind 4 · shadcn/ui · React Router · TanStack Query |
| 后端            | Bun · Hono · nodemailer · postgres.js                                                   |
| 共享            | `packages/shared`（Zod 4 schema 与类型，前后端共用）                                    |
| 部署            | Docker 多阶段（`oven/bun`）                                                             |

---

## 🚀 快速开始

### 本地开发

```bash
bun install

# 后端（:3000）
bun run dev:server

# 前端（:5173，/api 代理到 :3000）
bun run dev:web
```

访问 http://localhost:5173 ，默认管理员 `admin` / `admin123`（见环境变量）。

### Docker 部署（推荐）

```bash
# 1) 准备环境变量
cp .env.example .env   # 修改 ENCRYPT_KEY / SESSION_SECRET / ADMIN_PASSWORD

# 2) 构建并启动（默认 SQLite，数据持久化到命名卷 wh-data）
docker compose up -d --build
```

访问 http://localhost:3000 。前端由后端同源托管，无需单独部署。

> 接入 PostgreSQL：编辑 `docker-compose.yml`，取消 `db` 服务与 `DATABASE_URL=postgres://…` 注释即可。

---

## ⚙️ 环境变量

| 变量                  | 默认                     | 说明                                          |
| --------------------- | ------------------------ | --------------------------------------------- |
| `PORT`                | `3000`                   | 监听端口                                      |
| `DATABASE_URL`        | `sqlite:./data/app.db`   | 持久化连接串；`postgres://…` 切换到 PG        |
| `WEB_ROOT`            | `./web/dist`             | 前端静态资源目录（生产托管）                  |
| `ENCRYPT_KEY`         | 开发默认（**生产必改**） | 授权码/密钥 AES-256-GCM 主密钥（scrypt 派生） |
| `SESSION_SECRET`      | 开发默认（**生产必改**） | 会话 Cookie 签名密钥                          |
| `ADMIN_USER`          | `admin`                  | 管理员用户名                                  |
| `ADMIN_PASSWORD`      | `admin123`               | 管理员明文口令（**生产必改**）                |
| `ADMIN_PASSWORD_HASH` | —                        | scrypt 口令哈希（存在时优先于明文）           |

---

## 🔌 API 概览

| 方法                | 路径                                          | 说明               | 鉴权                |
| ------------------- | --------------------------------------------- | ------------------ | ------------------- |
| ANY                 | `/wh/:subpath`                                | Webhook 接收入口   | 端点级（HMAC 可选） |
| GET                 | `/api/health`                                 | 健康检查           | 公开                |
| POST                | `/api/auth/login` · `/logout` · GET `/me`     | 管理员会话         | 公开                |
| GET/POST/PUT/DELETE | `/api/endpoints` `/:id` · PATCH `/:id/toggle` | 子路径 CRUD + 启停 | 需登录              |
| GET/POST/PUT/DELETE | `/api/accounts` `/:id`                        | 邮箱账号 CRUD      | 需登录              |
| GET                 | `/api/stats` · `/api/stats/logs`              | 统计与转发日志     | 需登录              |

### HMAC 接入示例

对一个 `scheme=hex` / `signData=raw-body` / `algorithm=sha256` 的端点：

```bash
BODY='{"message":"hello"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "your-secret" | sed 's/^.* //')
curl -X POST http://localhost:3000/wh/sms \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

---

## 📁 项目结构

```
webhook-backend/
├─ packages/shared/     # @wh/shared：Zod schema 与共享类型
├─ server/              # Hono 后端
│  └─ src/
│     ├─ db/            # DAL：Repos 接口 + sqlite / pg 实现 + 工厂
│     ├─ services/      # crypto / expr / event / hmac / forward-engine
│     │  └─ channels/   # ForwardChannel：email / http / phone / ws + registry
│     ├─ routes/        # webhook / auth / endpoints / accounts / stats
│     ├─ middleware/    # auth 守卫
│     └─ index.ts       # 装配 + 静态托管
├─ web/                 # Vite + React 管理台
│  └─ src/{pages,components,lib}
├─ docs/                # 设计文档 / 架构图 / 进度文档
├─ Dockerfile · docker-compose.yml · .dockerignore
└─ Agents.md            # AI 协作规范（完成前强制流程）
```

---

## 🧪 质量门禁

每次功能完成需通过（见 `Agents.md`）：

```bash
bun run format   # Prettier
bun run lint     # ESLint（0 error/0 warning）
bun test         # 单元测试
bun run typecheck# shared + server + web 类型检查
```
