# 项目进度文档 — 自定义 Webhook 转发中心

> 本文档记录项目**当前进度**、**每次对话的决策日志**与**下一步计划**。
> 每完成一次实质性变更后，请在此追加记录（决策日志为追加，不覆盖历史）。
>
> 关联文档：设计文档 [`design-document.md`](./design-document.md) ｜ 架构图 [`architecture-diagram.html`](./architecture-diagram.html)

---

## 1. 当前阶段

| 项 | 状态 |
|----|------|
| 当前阶段 | **实现阶段（Implement）** — 后端 M2–M4 已完成并端到端验证，待推进 M5 WebUI |
| 代码实现 | 🟡 进行中（M1–M4 完成；M5–M7 进行中） |
| 下一步 | 推进 M5 WebUI（登录/仪表盘/子路径/账号管理，shadcn/ui），见 [§4 下一步计划](#4-下一步计划) |
| 最近更新 | 2026-07-19 15:30 |

### 交付物清单

| 交付物 | 路径 | 状态 |
|--------|------|------|
| 系统设计文档 | `docs/design-document.md` | ✅ 已完成（v1，随需求迭代更新） |
| 系统架构图 | `docs/architecture-diagram.html` | ✅ 已完成（随设计同步） |
| 进度文档 | `docs/PROGRESS.md` | ✅ 本文件 |
| 项目骨架 / 代码 | `web/` `server/` | ⬜ 未开始 |

---

## 2. 里程碑进度（M1–M7）

> 里程碑定义见设计文档 §13。

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| **M1 脚手架** | Bun workspace + Vite7/React19 前端 + Hono 后端 + 类型共享 | ✅ 已完成 |
| **M2 持久化与账号** | DAL（SQLite/Postgres，手写 DAL）+ 账号 CRUD + 授权码加解密 | ✅ 已完成 |
| **M3 子路径与接收** | endpoints CRUD + `ANY /wh/:subpath` 接收 + 接入契约（methods/parser/auth）+ 转发引擎 | ✅ 已完成 |
| **M4 转发通道** | `ForwardChannel` 抽象 + `EmailChannel` + `HttpChannel`（出站转发）+ 日志；预留 Phone/WS | ✅ 已完成 |
| **M5 WebUI** | 登录、仪表盘、子路径管理、账号管理页（shadcn/ui） | 🟡 进行中 |
| **M6 部署** | Dockerfile + compose + 健康检查 + 文档 | ⬜ 未开始 |
| **M7 加固** | 限流/重试、签名校验、压测 | ⬜ 未开始 |

图例：⬜ 未开始 ｜ 🟡 进行中 ｜ ✅ 已完成

---

## 3. 决策日志（Decision Log）

> 按时间倒序记录每次对话的关键决策、原因与影响文档。**追加，不修改历史。**

### 2026-07-19 15:30 — 完成后端 M2–M4（持久化/接收/转发全链路）并端到端验证
- **决策（偏离设计文档 §5.5）**：M2 持久化未采用 Drizzle ORM，改为**手写 DAL**——统一 `Repos` 接口（accounts/endpoints/logs）+ SQLite（`bun:sqlite`）与 PostgreSQL（`postgres.js`）两套实现，业务层只依赖接口、与方言解耦。理由：应用规模小，手写 DAL 依赖更少、风险更低、类型完全可控；此为工程取舍，用户如需仍可切回 Drizzle。
- **M2 完成**：
  - `services/crypto.ts`：AES-256-GCM 加解密（`iv.tag.ciphertext` base64）、scrypt 口令哈希、`safeEqual` 常量时间比较、`randomToken`；密钥由 `ENCRYPT_KEY` 经 scrypt 派生。
  - `db/{types,sqlite,pg,index}.ts`：`Repos` 接口 + 双方言实现 + `createRepos(DATABASE_URL)` 工厂（`postgres://` → pg，否则 sqlite，默认 `./data/app.db`）+ 单例。
  - `db/db.test.ts`：内存 SQLite 冒烟（账号 CRUD + 端点 JSON 往返 + 日志统计）。
- **M3 完成**：
  - `services/{expr,event,hmac}.ts`：dot-path 表达式引擎 + `{{var}}` 模板；`buildEvent` 归一（method/raw/body/headers/query/vars）；通用 HMAC 入站验签（hex/base64/prefix/scheme + 防重放 + 常量时间）与出站签名。
  - `services/forward-engine.ts`：编排 `buildEvent` → 遍历 `targets` → `getChannel` → `deliver` → `repos.logs.add` 落库。
  - `routes/webhook.ts`：`ANY /wh/:subpath`，方法校验（405）、端点查找（404/410）、HMAC 验签（401），**先回 200 再异步转发**。
  - `routes/endpoints.ts`：CRUD + toggle，HMAC 密钥加密存储 + 响应脱敏。
- **M4 完成**：
  - `services/channels/{types,email,http,phone,ws,registry}.ts`：`ForwardChannel` 抽象；`EmailChannel`（nodemailer + gmail/qq/163 SMTP 预设 + 模板渲染）；`HttpChannel`（dot-path 抽取 + 模板 body + none/bearer/basic/hmac 鉴权 + 超时 + 指数退避重试）；Phone/WS 预留 stub；注册表默认注册 email+http。
- **鉴权与 Admin API**：`services/session.ts`（签名 Cookie 会话）+ `middleware/auth.ts` + `routes/{auth,accounts,stats}.ts`；`index.ts` 装配全部路由 + 生产静态托管 `web/dist`。
- **端到端冒烟验证**（临时 sqlite，PORT=3199）：健康检查 ✅、未鉴权 401 ✅、登录/会话/`me` ✅、创建端点（Zod 默认值填充）✅、`ANY /wh/:subpath` 接收 200 ✅、HTTP 转发+重试退避+日志落库 ✅、成功转发路径 ✅、HMAC 无签 401 / 有效签 200 ✅、统计与日志接口 ✅。
- **测试补强（M7 加固项）**：新增 `expr.test.ts`/`hmac.test.ts`/`forward-engine.test.ts`；全仓 **18 pass / 0 fail**。
- **工具链修正**：`eslint.config.mjs` 增加 `@typescript-eslint/no-unused-vars` 的 `^_` 忽略模式（用于渠道接口占位参数如 phone/ws 的 `_target/_event/_deps`）。
- **门禁**：`bun run format` ✅、`bun run lint` ✅（0/0）、`bun test` ✅（18 pass）、server+web `typecheck` ✅。
- **影响**：M2/M3/M4 里程碑标记 ✅；新增 `server/package.json` 依赖 `nodemailer`/`postgres` + `@types/nodemailer`。下一步 M5 WebUI。

### 2026-07-19 14:38 — 接入 Prettier / ESLint / 测试 + 生成 Agents.md
- **决策**：用户要求补充代码质量工具链并约束 AI 协作流程。已新增：
  - **Prettier**：`.prettierrc.json`（用户指定配置：singleQuote/semi:false/trailingComma:all/printWidth:120/tabWidth:2/arrowParens:avoid/endOfLine:lf/bracketSpacing/bracketSameLine）+ 插件 `prettier-plugin-tailwindcss`（自动排序 className）；`.prettierignore` 排除 node_modules/dist/data/.workbuddy/docs/bun.lock。
  - **ESLint 9 flat config**（`.eslint.config.mjs`）：`@eslint/js` + `typescript-eslint`(recommended) + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`（仅 tsx）+ `eslint-config-prettier`（置于最后关闭冲突规则）。关闭 `react-refresh/only-export-components`（shadcn button.tsx 导出常量为已知误报）。
  - **脚本**：`bun lint`(eslint .) / `bun format`(prettier --write .) / `bun test`(bun test)。
  - **测试**：新增 `packages/shared/src/schemas.test.ts`（Zod schema 冒烟测试，4 用例全过）。
  - **Agents.md**：AI 协作规范约束——每次功能完成**必须**执行 `bun lint` → `bun format` → `bun test`（与可选 typecheck）并通过后再 `git commit`。
- **修正**：Tailwind 的 Prettier 插件实际包名是 `prettier-plugin-tailwindcss`（无作用域），`@prettier/plugin-tailwindcss` 在 npm 不存在；已更正。
- **验证**：`bun install` ✅、`bun run format` ✅、`bun run lint` ✅（0 error/0 warning）、`bun run test` ✅（4 pass）、`bun run typecheck` ✅（shared 需 `@types/bun` + `types:["bun"]` 以解析测试里的 `bun:test`）。
- **影响**：仓库具备统一格式化/校验/测试准入；里程碑状态不变（仍为 M1 ✅），但工程化基线升级。

### 2026-07-19 14:35 — 初始化 Git 并完成首提交
- **决策**：用户要求初始化 git 并提交当前这一轮工作。已 `git init -b main`，修复 `.gitignore` 中**行内尾随注释导致忽略规则失效**的问题（git 不支持尾随注释，已改为整行注释），重新暂存后确认 `.workbuddy/`、`.idea/`、`.vscode/`、`.cursor/` 等被正确忽略。
- **首次提交**：`d756297` — "chore: 初始化 Bun workspace 项目骨架 (M1) + 设计文档与进度文档"，包含 `docs/`（设计文档/架构图/进度文档）、根 workspace 配置、`.gitignore`、`packages/shared`、`server`、`web` 与 `bun.lock`；工作树干净。
- **影响**：仓库现已纳入版本控制；里程碑状态不变。

### 2026-07-19 14:33 — .gitignore 补充忽略项
- **决策**：用户要求 `.gitignore` 排除更多目录：我的工作目录 `.workbuddy/`、常见 AI 编码助手目录（`.cursor`/`.cline`/`.windsurf`/`.roo`/`.claude`/`.augment`/`.gemini`/`.kiro`/`.aider`/`.continue`/`.trae`/`.marscode`/`.fitten`/`.lingma` 等）、IDE 目录（`.idea`/`.vscode`/`.fleet`）及编辑器临时文件（`*.swo`/`*.swp` 等）。
- **影响**：更新根 `.gitignore`；里程碑状态不变（M1 仍 ✅）。

### 2026-07-19 14:30 — 确认方案并开始 M1 脚手架（已完成）
- **决策**：用户确认（1）现在开始实现；（2）前后端类型/Zod schema 用**独立共享包** `packages/shared/`（`@wh/shared`，方案 A）；（3）HttpChannel 表达式抽取用**轻量 dot-path**（零依赖，方案 A）。
- **完成内容（M1）**：Bun workspace（root + `packages/shared` + `web` + `server`）；`packages/shared` 落地 Zod 4 schema（channel/endpoint/account/parser/hmac/forwardTarget，email+http 两类 target）；`server` Hono 骨架 + `/api/health`；`web` Vite7+React19+TS+Tailwind4+shadcn/ui（手动初始化 components.json/lib/utils/button）+ React Router + TanStack Query。
- **验证**：`bun install` ✅、`bun run typecheck`（shared/server/web）✅、`bun run build:web` ✅、server 启动 `/api/health` 返回 `{status:"ok"}` ✅。
- **影响**：M1 里程碑标记 ✅；§4 三个开放问题全部 resolved。

### 2026-07-19 14:16 — 新增进度文档
- **决策**：新增 `docs/PROGRESS.md`，用于记录当前进度、决策日志与下一步计划。
- **原因**：用户希望有一份可追踪的进度与决策记录，方便跨对话延续。
- **约定**：此后每次实质变更都在本文件追加决策日志并更新 §1/§2 状态。
- **影响**：新增 `docs/PROGRESS.md`。

### 2026-07-19 14:09 — 新增 HttpChannel（v1 出站 HTTP 转发）
- **决策**：v1 在 Email 之外再实现一个 `HttpChannel`（`type:'http'`）：收到 Webhook 后用**特定表达式**（`bodyExpr`，dot-path/JSONPath）抽取消息内容，再用原生 `fetch` 以自定义 method/url/headers/body 转发到第三方。
- **细节**：出站鉴权 `auth`（none/bearer/basic/hmac 反向签名）、`timeoutMs`、`retries`；2xx 视为成功。WebUI 转发目标表单按 channel 自适应。
- **原因**：让系统不仅能"收 Webhook 发邮件"，也能"收 Webhook 转发 Webhook"，成为通用事件路由中枢。
- **影响**：设计文档 §1.1 / §5.2 / §5.3（拆为 5.3.1 Email + 5.3.2 Http）/ §5.6 / §9 / §13 M4；架构图转发通道框改为 Email·Http（v1）。

### 2026-07-19 14:01 — 转发引擎抽象化（ForwardChannel）
- **决策**：转发引擎重构为**渠道无关抽象**。定义统一接口 `ForwardChannel`（`type`/`render`/`send`/`health?`）+ `ForwardTarget`/`OutgoingMessage`；引擎按 `target.channel` 从渠道注册表取 channel，渲染→发送→记日志。
- **原因**：为后续接入 Phone/WS/企业微信等做准备，新增渠道零改引擎。
- **影响**：设计文档 §1.1 / §5.2（重写）/ §5.3 / §9 / §12.2 / §13；架构图渠道框改名。Email 为首实现，Phone/WS 预留接口。

### 2026-07-19 13:57 — 持久化可插拔 + UI 换 shadcn/ui
- **决策 1**：持久化改为**可插拔**——默认 SQLite（`bun:sqlite`），可选 PostgreSQL（`postgres.js`），经 **Drizzle ORM** 双方言共用同一 schema；方言由 `DATABASE_URL` 决定。
- **决策 2**：UI 组件库从"裸 Radix primitives 自组合"改为 **shadcn/ui**（基于 Radix + Tailwind，组件源码纳入仓库，简洁精美、可深度定制）。
- **原因**：用户需要生产环境可接 Postgres；用户认为裸 Radix 不够美观，倾向 shadcn/ui。
- **影响**：设计文档 §1.1/§2.2/§3.1/§3.2/§3.3/§4/§5.5/§5.6/§7/§9/§10/§13；架构图持久化框改为 SQLite/PG。

### 2026-07-19（早） — 通用化接入契约（任意 Method + 自定义体 + 通用 HMAC）
- **决策**：Webhook 接收端抽象为**声明式接入契约**：每个子路径独立配置 `methods`（任意方法/白名单）、`parser`（source/contentType/mapping 归一为变量）、`auth`（通用 HMAC-SHA-256：header/scheme/signData/防重放）。
- **参考**：`bogkonstantin/android_income_sms_gateway_webhook`（POST+JSON，可选 `X-Signature` 头放 hex HMAC-SHA-256，对原始 payload 签名）。抽象为通用能力，不绑定单一站点（含 GitHub `X-Hub-Signature-256` 等）。
- **原因**：用户要求做通用的 Webhook 转发中心，而非仅适配某站点。
- **影响**：设计文档 §5.1/§5.1.1/§5.8、endpoints 表、API、数据流、安全；架构图接收框改 `ANY`、数据流插入"接入适配 & HMAC"步。

### 2026-07-19（初） — 需求分析与初版设计
- **决策**：确立系统定位（自定义 Webhook 转发中心，面向邮箱转发 Gmail/QQ/163）与技术基线：Vite 7 + React 19 + TS + Tailwind 4 + TanStack Query + RHF/Zod；后端 Bun + Hono + nodemailer；Docker 多阶段部署。
- **关键设计**：单进程承载接收/Admin API/静态托管/发送；授权码 AES-GCM 加密存储；接收端先回 200，失败写 `forward_logs` 异步重试（成功接收 ≠ 成功送达）。
- **影响**：初版 `docs/design-document.md` 与 `docs/architecture-diagram.html`。

---

## 4. 下一步计划

后端 M1–M4 已完成并端到端验证，下一步推进前端与部署：

1. **M5 — WebUI**（进行中）
   - 补齐 shadcn 组件（input/label/card/dialog/select/table/badge/switch/sonner 等）
   - API 客户端 + 鉴权上下文（登录/登出/me）
   - 页面：登录、仪表盘（统计+日志）、子路径管理（CRUD+toggle，转发目标按 channel 自适应表单）、邮箱账号管理（SMTP 预设+授权码）
2. **M6 — 部署**：多阶段 Dockerfile + docker-compose.yml + .dockerignore + README。
3. **M7 — 加固**：限流/重试打磨、补测试、完整 `install/format/lint/test/typecheck/build`，收尾提交。

### 开放问题（已全部 resolved）
- [x] 是否现在开始 M1 脚手架搭建？→ **是**，已于 2026-07-19 14:30 完成 M1（见决策日志）。
- [x] 是否需要 `packages/shared/` 独立共享包？→ **方案 A**：已建 `@wh/shared`，Zod schema 与共享类型集中维护，前后端 import。
- [x] 出站 HttpChannel 的表达式引擎？→ **方案 A：dot-path**（零依赖，`data.message` / `payload.items[0]`），设计文档已采用。

---

_维护约定：每次实质变更 → 更新 §1 当前阶段与 §2 里程碑状态 → 在 §3 追加一条决策日志 → 视情况调整 §4 下一步。_
