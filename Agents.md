# Agents.md — AI 协作规范约束

> 本文件用于约束 AI 编码助手（WorkBuddy / Cursor / Claude / Copilot 等）在本仓库中的行为。
> 任何自动化代理在完成功能或改动后，**必须**遵守下方的「完成前强制流程」。

## 1. 项目概览

自定义 **Webhook 转发中心**：外部系统向自定义子路径 `ANY /wh/:subpath` 发送请求 → 按端点契约做方法匹配、请求体解析、通用 HMAC-SHA-256 验签 → 转发引擎按 `target.channel` 选择 `ForwardChannel` 渲染并投递（当前实现 `email` 邮件 SMTP 与 `http` 出站转发，预留 `phone` / `ws`）→ 收件人邮箱 / 第三方 HTTP 服务。管理员通过 WebUI 在 `/api` 上 CRUD 子路径与邮箱账号，配置持久化到 **SQLite（默认）/ PostgreSQL（可选）**。

## 2. 技术栈

- **包管理 / 运行时**：Bun + Bun Workspace
- **前端**：Vite 7 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + React Router + TanStack Query
- **后端**：Bun + Hono + 手写 DAL 双方言（`bun:sqlite` / `postgres.js`，统一 `Repos` 接口）+ nodemailer
- **共享**：`packages/shared`（`@wh/shared`）存放 Zod 4 schema 与共享类型，前后端共用
- **部署**：Docker 多阶段（oven/bun 镜像）

## 3. 常用命令

| 命令                   | 说明                                            |
| ---------------------- | ----------------------------------------------- |
| `bun install`          | 安装依赖                                        |
| `bun run dev:web`      | 启动前端开发服务器（Vite，:5173）               |
| `bun run dev:server`   | 启动后端（Hono，:3000）                         |
| `bun run build:web`    | 前端生产构建                                    |
| `bun run build:server` | 后端构建                                        |
| `bun run typecheck`    | 对 shared / server / web 做 TS 类型检查         |
| `bun run lint`         | ESLint 全量检查（`eslint .`，flat config）      |
| `bun run format`       | Prettier 格式化全部源码（`prettier --write .`） |
| `bun run test`         | 运行测试（`bun test`，跨 workspace 发现用例）   |

## 4. ⛔ 完成前强制流程（每次功能/改动都必须执行）

任何一次「完成一个功能、修复一个 bug、或一次实质改动」之后，**必须按顺序执行并全部通过**，然后再进行 git 提交：

1. `bun run lint` —— ESLint 零错误（warning 也尽量清零）
2. `bun run format` —— Prettier 统一格式化（提交前格式化，避免风格漂移）
3. `bun run test` —— 测试通过
4. （可选但推荐）`bun run typecheck` —— 类型检查通过

> 若 lint / test 发现问题，**先修复再提交**，禁止带着错误提交。
> `bun run format` 应在 `bun run lint` 之后、`git commit` 之前执行（format 不引入逻辑变更，仅统一风格）。

## 5. Git 提交约束

- 仓库主分支为 `main`；提交信息使用中文或清晰的英文，主题行简洁概括。
- 每次实质改动完成上述强制流程后，**必须完成一次 git 提交**（不要堆积多个功能在同一次未提交状态）。
- 禁止提交：`node_modules/`、`**/dist/`、`data/`、`.workbuddy/`（工作目录）、`.env*`、IDE/AI 助手目录（`.idea/`、`.vscode/`、`.cursor/` 等）。这些已在 `.gitignore` 中忽略。
- 若需 amend，仅在本地未推送且用户明确同意时进行；默认优先新建提交。

## 6. 代码与架构约定

- **渠道抽象**：新增转发渠道只需实现 `ForwardChannel` 接口（`type` / `render` / `send` / `health?`）并注册到 Channel Registry，引擎无需改动。当前实现：`email`（SMTP/nodemailer，Gmail/QQ/163）、`http`（出站 fetch 转发）。`phone` / `ws` 仅预留。
- **共享类型**：前后端共用 schema 放在 `packages/shared`，不要前后端各抄一份。
- **接入契约**：每个子路径独立配置 `methods`（任意方法/白名单）、`parser`（source/contentType/mapping 归一为变量）、`auth`（通用 HMAC-SHA-256：header / scheme / signData / 防重放）。
- **表达式抽取**：HttpChannel 的 `bodyExpr` 使用轻量 dot-path（零依赖），如 `data.message`、`payload.items[0]`。
- **敏感信息**：邮箱授权码等密钥用 AES-GCM 加密存储，API 不返回明文。
- **先回 200**：Webhook 接收端先回 200，发送成败写 `forward_logs` 异步重试（成功接收 ≠ 成功送达）。

## 7. 代码风格（Prettier，见 `.prettierrc.json`）

- 单引号 `singleQuote: true`；无分号 `semi: false`
- 尾逗号 `trailingComma: "all"`；行宽 `printWidth: 120`；缩进 2 空格
- 箭头函数单参数省括号 `arrowParens: "avoid"`
- 行尾 `endOfLine: "lf"`；对象括号 `bracketSpacing: true`、`bracketSameLine: true`
- 已启用 `prettier-plugin-tailwindcss`，自动排序 className

## 8. 参考文档

- `docs/design-document.md` — 系统设计与架构说明
- `docs/architecture-diagram.html` — 架构图与数据流图
- `docs/PROGRESS.md` — 进度、决策日志与下一步计划
