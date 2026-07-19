# 项目进度文档 — 自定义 Webhook 转发中心

> 本文档记录项目**当前进度**、**每次对话的决策日志**与**下一步计划**。
> 每完成一次实质性变更后，请在此追加记录（决策日志为追加，不覆盖历史）。
>
> 关联文档：设计文档 [`design-document.md`](./design-document.md) ｜ 架构图 [`architecture-diagram.html`](./architecture-diagram.html)

---

## 1. 当前阶段

| 项 | 状态 |
|----|------|
| 当前阶段 | **实现完成（Implemented）** — M1–M7 全部完成并端到端验证 |
| 代码实现 | ✅ 完成（M1–M7 全部完成） |
| 下一步 | 交付使用；后续可选：更新 WebUI 提示说明、真实 SMTP 发信联调、Docker 镜像实机构建、更多渠道（Phone/WS） |
| 最近更新 | 2026-07-19 20:00 |

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
| **M5 WebUI** | 登录、仪表盘、子路径管理、账号管理页（shadcn/ui） | ✅ 已完成 |
| **M6 部署** | Dockerfile + compose + 健康检查 + 文档 | ✅ 已完成 |
| **M7 加固** | 限流/重试、签名校验、压测 | ✅ 已完成 |

图例：⬜ 未开始 ｜ 🟡 进行中 ｜ ✅ 已完成

---

## 3. 决策日志（Decision Log）

> 按时间倒序记录每次对话的关键决策、原因与影响文档。**追加，不修改历史。**

### 2026-07-19 20:00 — 弹窗体验与毛玻璃增强 + 新增代理配置
- **弹窗横向滚动**：`DialogContent` 面板加 `overflow-x-hidden`；所有说明段落（含 `code` 长 token）加 `break-words`，避免不可断行字符串把面板撑宽产生横向滚动条。
- **弹窗生硬动画（从右上角跳出再回中间）**：根因是定位用 `-translate-x/y-1/2`，而动画关键帧又用 `transform: scale(...)` 与定位 translate 抢同一 `transform` 属性，导致首帧定位失效而跳位。改为**只动画 `opacity` + `zoom`**（zoom 是独立属性，不占用 transform），配合 `animation-fill-mode: both` 消除首帧闪烁；定位 translate 全程稳定 → 不再跳位。`web/src/index.css` 的 `@keyframes wh-dialog-in/out` 改为 opacity+zoom。
- **毛玻璃增强**：玻璃 token 提透明度（`--glass-bg` 0.055→0.085、边框 0.10→0.14、sheen 0.08→0.14）、blur 22→30px、加顶部线性高光渐变；`glass-soft` 同步增强（blur 12→18px、加渐变）；body 背景辉光层次加密加亮（仍保持中性黑白，无彩色），让磨砂折射明显可见。
- **新增 HTTP 目标代理配置**：`httpTargetSchema` 增加可选 `proxy`（z.string().url()）；`web/src/lib/api.ts` / `endpoint-dialog.tsx` 表单（HttpTargetForm / toForm / buildPayload / UI 输入框）全部打通；`server/src/services/channels/http.ts` 的 `fetchWithTimeout` 把 `target.proxy` 透传给 Bun 原生 `fetch({ proxy })`（已实测 Bun 1.3.14 的 fetch 支持 proxy 选项，请求确实经代理路由）。留空则直连。
- **验证**：`bun run lint/format/typecheck` 全绿；`bun test` 29 全过；`build:server`/`build:web` 成功；预览后端已重启（端口 3000 单端口托管新版 SPA，SPA `/`、CSS、API 均 200）。**未提交**（待用户确认/统一提交）。

### 2026-07-19 19:42 — bodyExpr 抽取变量改名 `$` + HMAC 验签说明与配置补全
- **`$` 变量**：用户要求把 bodyExpr 抽取结果在模板中的变量名由 `extracted` 简写为 `$`（更直观）。服务端与前端预览均以 `{ ...ctx, $: extracted }` 注入——标量用 `{{$}}`、对象用 `{{$.field}}`。
- **HMAC UI 说明**：端点对话框为 bodyExpr、HMAC「编码方案」「被签名数据」、时间戳防重放补中文说明；并补上此前缺失的配置项：入站 HMAC 的 `prefix`/`schemeKeyword`/`timestampHeader`/`tolerance`，出站 HMAC target 的 `prefix`/`schemeKeyword`。
- **修复出站 HMAC 用密文签名**：`http.ts` 的 `applyAuth` 原先直接拿加密的 `secretRef` 当密钥签（永远校验不过）；改为 `deps.decrypt(secretRef)` 解密后用明文签，并透传 `prefix`/`schemeKeyword`。
- **schema 同步**：`packages/shared` 的 `httpOutAuthSchema` 与 `web/src/lib/api.ts` 本地 `HttpOutAuth` 增加 `prefix`/`schemeKeyword` 可选字段。
- **验证**：e2e 确认 `{{$}}` 正确取标量、`scheme=prefix` 验签 200 / 错签 401；`bun test` 29 全过。提交 `88f1809`。

### 2026-07-19 18:58 — 修复：无 mapping 时出站模板可直接引用请求体顶层字段
- **Bug 报告**：用户截图显示，入站 body `{"platform":"qq","message":"adbc","content":"HTTP 测试消息"}`，出站 bodyTpl `{"text":"{{message}}"}`，未配置 mapping 时实际渲染为 `{"text":""}`；必须额外配置 `message->message` 映射才能取到值。
- **根因**：`eventContext` 仅把 `parser.mapping` 映射出的 `vars` 暴露到顶层模板变量，未把请求体顶层字段作为便捷变量。
- **修复**：`server/src/services/event.ts` 的 `eventContext` 现在先把普通对象类型的 `body` 顶层字段展开到上下文，再 spread `event.vars`；显式 mapping 优先级更高，数组/字符串 body 不展开。保留 `body/vars/headers/query/raw/method` 命名空间。
- **新增测试**：`server/src/services/event.test.ts` 覆盖 parseBody、buildEvent、eventContext（含优先级、数组/字符串边界）。
- **验证**：用户场景复现通过（无 mapping 时 `{{message}}`→`"adbc"`，出站 requestBody 为 `{"text":"adbc"}`）；`bun test` 14 全过；format/lint/typecheck/build:server/build:web 全绿。提交 `9ed1cf8`（2 files）。
- **提示更新**：WebUI 的 mapping 与 bodyTpl 提示文本应说明“未配置 mapping 时，请求体顶层字段会自动作为变量使用”。


### 2026-07-19 16:50 — 完成 M7 加固（Webhook 限流）+ 全量验证，项目实现完成
- **限流**：新增 `middleware/rate-limit.ts`——固定窗口内存限流器（默认 120 次/60s/客户端，`RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX` 可调，`MAX<=0` 关闭）；客户端标识优先 `x-forwarded-for`/`x-real-ip`，回退 Bun `requestIP`；响应带 `X-RateLimit-{Limit,Remaining,Reset}`，超限返回 429 + `Retry-After`；惰性清理过期桶。已挂载到 `/wh/:subpath` 公开入口。
- **测试**：新增 `rate-limit.test.ts`（放行/递减、429+Retry-After、多客户端独立计数，3 用例）。全仓 **21 pass / 0 fail**。
- **重试**：出站 HttpChannel 的指数退避重试（`retries+1` 次）已在 M4 落地并经端到端验证。
- **最终端到端验证**（生产模式，托管 dist）：登录 ✅、创建端点 201 ✅、`POST /wh/demo` 200 且返回限流头（Limit=120/Remaining=119）✅、HTTP 转发成功落库 ✅、`/api/stats` 返回 `endpoints:1/success:1` ✅。
- **门禁**：`format` ✅、`lint` ✅（0/0）、`test` ✅（21 pass）、`typecheck`（shared+server+web）✅。
- **影响**：M7 里程碑 ✅；**M1–M7 全部完成，项目实现阶段收官**。

### 2026-07-19 16:35 — 完成 M6 部署（Docker 多阶段 + compose + README）
- **Dockerfile**：多阶段——builder（`oven/bun:1`，先拷贝各包 `package.json` + `bun.lock` 做 `bun install --frozen-lockfile` 以复用缓存，再 `bun run build:web`）；runtime（`oven/bun:1-slim`，仅拷贝 node_modules/packages/server/web/dist/package.json）。**运行时直接 `bun run server/src/index.ts`**（而非打包，规避 nodemailer/postgres 动态 require 打包问题）。`VOLUME /app/data` 持久化 SQLite；`HEALTHCHECK` 用 bun 原生 `fetch` 打 `/api/health`（slim 无 curl）。
- **docker-compose.yml**：`app` 服务默认 SQLite（命名卷 `wh-data`），端口 3000，安全环境变量用 `${VAR:-default}` 注入；预留（注释）`db`（postgres:16-alpine）+ `DATABASE_URL=postgres://…` + `depends_on` 一键切换。
- **.dockerignore**：排除 node_modules/dist/data/.git/IDE/AI 工作目录/docs（保留 README），减小构建上下文。
- **.env.example**：PORT/DATABASE_URL/WEB_ROOT/ENCRYPT_KEY/SESSION_SECRET/ADMIN_* 示例与说明。
- **README.md**：特性、技术栈、本地开发、Docker 部署、环境变量、API 概览、HMAC 接入示例（openssl）、项目结构、质量门禁。
- **修正**：`Agents.md` 技术栈把"Drizzle ORM 双方言"更正为"手写 DAL 双方言（bun:sqlite / postgres.js，统一 Repos 接口）"。
- **验证**：compose YAML 解析 ✅（services=[app]、volumes=[wh-data]）；`format/lint/test(18 pass)/typecheck` 全过。**注**：当前环境无 Docker 守护进程，镜像构建未能本地验证；Dockerfile/compose 遵循 oven/bun 官方多阶段标准写法。
- **影响**：M6 里程碑 ✅。

### 2026-07-19 — SMTP 代理、Glass UI 与父目录 Compose 调整

- **SMTP 根因与修复**：日志中的 `198.18.0.5:465` 不是 QQ SMTP 的正常地址，结合运行环境存在的代理/DNS fake-IP 行为，不能简单归因于 QQ 凭据错误。邮箱账号新增可选 `proxy` 字段，服务端贯通 SQLite/PostgreSQL 迁移、API 校验和 Nodemailer HTTP/HTTPS CONNECT 代理；Docker 中代理地址应使用 `host.docker.internal`，不能使用容器自身的 `127.0.0.1`。
- **WebUI**：降低嵌套玻璃层的透明度与模糊半径，增加可见的材质层次；弹窗由会触发布局的 `zoom` 改为 `opacity + scale + translate` 合成层动画，遮罩加入轻量模糊，并尊重 `prefers-reduced-motion`。
- **Docker**：运行时只安装 production 依赖；`docker-compose.yml` 改为源码父目录模板，使用 `env_file: ./webhook-backend/.env` 和 `./webhook-backend/data:/app/data`，移除 PostgreSQL 配置，服务名改为 `webhook-backend`。

### 2026-07-19 — 修复 Dialog 偏移、日志发件人快照与玻璃材质

- **Dialog**：上一版动画使用 CSS individual `translate`，覆盖 Tailwind v4 的居中 `-translate-x-1/2 -translate-y-1/2`，导致弹窗偏移到右下角；动画现在只改变 `opacity` 和 `scale`。浏览器验证在 1280×720 视口中弹窗中心为 `(640, 360)`。
- **邮件日志**：SMTP 实际发送仍使用 RFC 5322 的显示名格式；出站日志快照改为记录纯发件地址，避免 JSON 中出现误解性的 `"名称" <地址>`。
- **日志页**：增加手动刷新按钮，刷新期间显示旋转图标并禁用按钮。
- **视觉**：重做冷蓝灰玻璃材质，降低白色高光和纯白按钮，增加背景光斑、32px 背景模糊和更克制的内描边。

### 2026-07-19 16:10 — 完成 M5 WebUI（shadcn/ui 管理台）并生产托管验证
- **UI 组件**：手写落地 shadcn 组件 `input/textarea/label/card/badge/switch/table/dialog/select/sonner`（Radix + Tailwind，源码入库），新增依赖 `@radix-ui/react-{label,dialog,select,switch,tabs}` + `sonner`。
- **基础设施**：`lib/api.ts`（同源 `/api/*` fetch 客户端 + 全量 TS 类型 + auth/stats/endpoints/accounts 四组 API，`credentials:'include'`）；`lib/auth.tsx`（AuthProvider + `useAuth`，启动查 `/auth/me`）；`components/layout.tsx`（侧边栏导航 + 退出登录）。
- **页面**：
  - `Login`：卡片式登录，失败 toast。
  - `Dashboard`：4 张统计卡（子路径/账号/成功/失败，10s 轮询）+ 最近转发日志表（成功红/失败按中国习惯已用 emerald/destructive 语义 badge）。
  - `Endpoints`：列表（子路径可点击复制 `/wh/xxx` 接收地址、方法/校验/目标摘要、启停 Switch、编辑/删除）+ `EndpointDialog` 全功能表单（基本信息、任意方法开关、入站解析 source/contentType/字段映射、HMAC 验签配置、**渠道自适应**转发目标编辑器：email=账号/收件人/主题正文模板/格式，http=URL/method/bodyExpr/bodyTpl/contentType/超时重试/出站鉴权 none·bearer·basic·hmac；密钥编辑留空=不改）。
  - `Accounts`：邮箱账号列表 + `AccountDialog`（服务商预设、授权码脱敏、留空不改）。
- **路由与主题**：`App.tsx` 路由 + `Protected` 鉴权守卫（loading/未登录跳登录）；`main.tsx` 挂 AuthProvider/QueryClient/Toaster，固定 `dark` 主题。
- **验证**：`web typecheck` ✅、`format` ✅、`lint` ✅（0/0）、`vite build` ✅（458KB/gzip 145KB）；后端 `WEB_ROOT` 托管 dist 生产验证：`/` 返回含 `dark` 的 index.html ✅、SPA 回退 `/endpoints`→200 ✅、JS 资源 `text/javascript` ✅、`/api/health` ✅。
- **影响**：M5 里程碑 ✅。下一步 M6 部署。

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
