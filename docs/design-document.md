# 自定义 Webhook 转发中心 — 系统设计文档

> 版本：v1.0 ｜ 日期：2026-07-19 ｜ 状态：设计稿（待评审）
> 技术基线：TypeScript + React 19 + Vite 7 + Bun + Hono ｜ 部署：Docker

---

## 1. 概述

本系统是一个**自定义的 Webhook 转发中心**，核心目标是把外部系统推送过来的 HTTP 请求（Webhook），按用户预先配置的规则，转换为邮件并转发到指定邮箱。系统面向邮箱转发场景，首批支持 **Gmail / QQ / 163** 等主流邮箱渠道。

管理员通过一套轻量、现代的 WebUI 完成全部资源管理：

- 自定义并新增 **Webhook 子路径**（如 `/wh/order-paid`、`/wh/ci-failed`）
- 为每个子路径配置**标题、基础信息、转发渠道**
- 新增并管理**指定渠道的邮箱账号**（发件凭据），供转发使用

### 1.1 一句话架构

> 外部系统以**任意 HTTP 方法** `请求 /wh/:subpath` → 服务按端点契约做方法匹配、体解析与 HMAC 验签 → 转发引擎按 `target.channel` 选 `ForwardChannel` 渲染并投递（v1 含 Email/SMTP 与 HttpChannel 出站转发，预留 Phone/WS）→ 收件人邮箱 / 第三方 HTTP 服务（等）；管理员通过 WebUI 在 `/api` 上 CRUD 子路径（含 `methods` / `parser` / `auth`）与邮箱账号，配置持久化到 **SQLite（默认）/ PostgreSQL（可选）**。

---

## 2. 需求分析

### 2.1 功能需求（FR）

| 编号 | 需求 | 说明 |
|------|------|------|
| FR-1 | 自定义请求子路径 | 每个 webhook 端点拥有一个唯一子路径（slug），如 `order-paid` |
| FR-2 | 新增 / 编辑 / 删除子路径 | 通过 WebUI 管理，子路径全局唯一 |
| FR-3 | 子路径元信息 | 每个子路径可配置标题、描述、是否启用 |
| FR-4 | 配置转发途径 | 子路径可绑定一个或多个转发目标（渠道 + 收件人 + 主题模板） |
| FR-5 | 邮箱渠道转发 | 支持 Gmail、QQ、163 等；通过 SMTP + 授权码/应用专用密码发送 |
| FR-6 | 邮箱账号管理 | 按渠道新增邮箱账号（发件人、授权码、发件名），供转发复用 |
| FR-7 | WebUI 管理后台 | 子路径管理、邮箱账号管理、仪表盘概览 |
| FR-8 | 转发日志 / 状态 | 记录每次转发的成功/失败，供仪表盘展示 |
| FR-9 | 自定义请求方法 | 每个子路径可声明允许的方法：`POST` / `GET` / 任意（`*`），GET 场景从查询参数取负载 |
| FR-10 | 自定义请求体结构 | 可声明负载来源（body/query/header）、内容类型与字段映射，将任意入站结构归一为变量 |
| FR-11 | 通用 HMAC-SHA-256 校验 | 可声明签名头、编码格式（hex/base64/前缀）、被签内容、算法与防重放，通用适配任意来源 |

### 2.2 非功能需求（NFR）

| 维度 | 要求 |
|------|------|
| 技术栈 | TypeScript + React 19 + Vite 7；包管理 **Bun**；后端 **Bun + Hono** |
| 依赖策略 | 尽量最新版本且**低风险**（稳定版、活跃维护、无原生编译坑） |
| 部署 | **Docker**（多阶段构建），`docker compose` 一键起 |
| UI | 组件库 **shadcn/ui**（基于 Radix + Tailwind，简洁精美、可深度定制）；深色友好、响应式、清晰表单/表格 |
| 持久化 | 默认 **SQLite**（零配置、文件型），可切换 **PostgreSQL**；经统一数据访问层抽象，业务代码不感知方言 |
| 可维护性 | 前后端同仓（Bun workspace），类型共享，配置即代码友好 |
| 安全 | 邮箱授权码加密存储；管理后台需认证；不泄露密钥到日志 |
| 可靠性 | 转发失败有日志与基础重试；服务有健康检查 |

---

## 3. 技术选型与版本（最新且低风险）

> 选型原则：优先选**稳定版 + 官方对 Bun/React19 友好 + 无原生编译风险**的依赖。版本为截至 2026 年中可稳定获取的基线，实际以 `bun add` 时解析到的 minor/patch 为准。

### 3.1 前端（WebUI）

| 用途 | 选型 | 版本基线 | 理由 / 风险 |
|------|------|----------|-------------|
| 构建工具 | **Vite** | 7.x | 最新主版本，启动快、配置少；与 React 19 完全兼容 |
| UI 框架 | **React** | 19.x | 最新稳定，并发特性、更小运行时 |
| 语言 | **TypeScript** | 5.x | 全栈类型共享 |
| 路由 | **React Router** | 7.x（声明式 SPA 模式） | 稳定，避免 framework/SSR 复杂度 |
| 样式 | **Tailwind CSS** | 4.x | 最新版，使用 `@tailwindcss/vite` 插件，零配置、性能佳 |
| 组件库 | **shadcn/ui**（基于 Radix UI primitives + Tailwind，组件源码直接纳入仓库、可深度定制）+ **lucide-react** 图标 | 最新 | 简洁精美的现成组件（按钮/输入框/表单/对话框/抽屉/下拉/表格/Toast/卡片），无障碍达标；无额外重型运行时，与 React 19 完全兼容 |
| 服务端状态 | **TanStack Query** | 5.x | 请求缓存/失效，管理后台标配 |
| 表单 | **React Hook Form + Zod** | RHF 7.x / Zod 3–4 | 轻量受控表单 + 校验，两端复用 Zod schema |
| HTTP 客户端 | 原生 `fetch` | — | 后端同源，无需额外库 |

> 说明：shadcn/ui 通过 `shadcn` CLI 将组件源码拷入 `src/components/ui`，无运行时依赖、可任意改造，配合 Tailwind 4 + React 19 体验最佳。若希望零定制，可选 Ant Design v5 + 兼容补丁，但本文以 **shadcn/ui** 为默认推荐。

### 3.2 后端（Server）

| 用途 | 选型 | 版本基线 | 理由 / 风险 |
|------|------|----------|-------------|
| 运行时 | **Bun** | 1.x（`oven/bun` 镜像） | 原生 TS、内置 SQLite、HTTP 性能高 |
| Web 框架 | **Hono** | 4.x | 对 Bun 一等支持、极快、TS 友好、中间件生态成熟 |
| 数据库 | **可插拔数据访问层**（默认 `bun:sqlite`；可选 `postgres.js` + PostgreSQL） | — | 经 **Drizzle ORM** 双方言支持（`drizzle-orm/bun-sqlite` 与 `drizzle-orm/postgres-js` 共用同一 schema）。SQLite：零原生依赖、免编译、文件型、零配置；PostgreSQL：适合生产/高并发。方言由 `DATABASE_URL` 决定，业务仓储不感知具体数据库 |
| 校验 | **Zod** | 3–4 | 与前端共享 schema，请求体校验 |
| 邮件 | **nodemailer** | 6.x | 通用 SMTP，Gmail/QQ/163 全支持；久经考验、低风险 |
| 日志 | **pino** | 9.x | 结构化、高性能；可选 |
| 加密 | **Bun 原生 `crypto`（AES-GCM / scrypt）** | — | 邮箱授权码加密存储，无需额外依赖 |
| 认证 | 签名 Cookie Session（Hono `cookie` 辅助 + HMAC） | — | 自托管场景足够；密码 scrypt 哈希 |

### 3.3 部署

| 用途 | 选型 |
|------|------|
| 镜像 | 多阶段 `Dockerfile`：`oven/bun:1` 构建 + 运行 |
| 编排 | `docker-compose.yml`（server + 可选 nginx） |
| 数据持久化 | SQLite 默认挂载卷 `./data`（或配置 `DATABASE_URL` 指向外部 PostgreSQL，无需卷） |
| 配置 | 环境变量（端口、管理员密码哈希、加密密钥、CORS） |

---

## 4. 系统架构（组件视图）

> 下方为组件级架构，图形化版本见 `architecture-diagram.html`。

```
┌─────────────────┐         ┌──────────────────────────────────────────────┐         ┌──────────────────┐
│ 外部 Webhook    │  POST   │            Webhook 转发中心 (Bun + Hono)        │  SMTP   │  收件人邮箱       │
│ 触发源          │ ──────▶ │  ┌────────────┐   ┌─────────────────────────┐  │ ──────▶ │ (Gmail/QQ/163…)  │
│ (CI/支付/监控)  │ /wh/:sp │  │ Webhook    │   │ 转发引擎 ForwardEngine  │  │         │                  │
└─────────────────┘         │  │ Receiver   │──▶│  格式化→选渠道→发送      │  │         └──────────────────┘
                             │  └────────────┘   └───────────┬─────────────┘  │
┌─────────────────┐  HTTPS  │  ┌────────────┐   ┌───────────▼─────────────┐  │
│ 管理员浏览器    │ ──────▶ │  │ WebUI(SPA) │   │ 邮件渠道服务 MailChannel │  │
│ (React 19)      │  / 与   │  │ 静态托管    │   │ Gmail / QQ / 163 适配器  │  │
└─────────────────┘  /api   │  └─────┬──────┘   └─────────────────────────┘  │
                             │  ┌─────▼──────┐   ┌─────────────────────────┐  │
                             │  │ Admin API  │   │ 持久化 SQLite/Postgres   │  │
                             │  │ /api/*     │◀─▶│ endpoints/accounts/logs │  │
                             │  └─────┬──────┘   └─────────────────────────┘  │
                             │  ┌─────▼──────┐                              │
                             │  │ Auth 中间件 │                              │
                             │  └────────────┘                              │
                             └──────────────────────────────────────────────┘
```

**关键设计点**
- 单进程服务同时承载：Webhook 接收、Admin API、静态 WebUI 托管、邮件发送。部署简单。
- WebUI 构建产物由服务端以静态文件托管（同源，免 CORS 烦恼）。
- 所有写操作（Admin API）经 Auth 中间件；Webhook 接收端点按**声明式接入契约**工作：每个子路径可独立配置 `methods`（任意方法）、`parser`（自定义请求体结构）与 `auth`（通用 HMAC-SHA-256 验签），从而通用适配任意来源（见 5.1 / 5.8）。

---

## 5. 核心模块说明

### 5.1 Webhook 接收与接入适配（Receiver + Inbound Adapter）
每个子路径拥有**声明式接入契约（inbound contract）**，服务据此对入站请求做方法匹配、体解析与签名校验，从而**通用化**地适配任意来源（不局限于某一站点）。

- 路由：`ANY /wh/:subpath`；实际允许的方法由端点 `methods` 配置决定：可为 `["POST"]`、`["GET","POST"]` 或 `["*"]`（接受任意方法）。GET 场景从查询参数取负载。
- 行为：
  1. 按 `subpath` 查询 `endpoints`；不存在或 `active=false` → `404`/`410`。
  2. **方法匹配**：请求方法须在 `methods` 白名单内（或 `*`），否则 `405`。
  3. **体解析（自定义请求体接收结构）**：依据端点 `parser` 将请求归一为"事件对象"：
     - `source`：`body`（原始体）/ `query`（查询参数，GET 场景）/ `header`。
     - 内容类型：自动识别 `json` / `form` / `text` / `raw`；JSON 支持 dot-path 取值。
     - `mapping`：将任意入站字段抽取为命名变量（如 `from`、`text`、`code`），供邮件模板引用。
  4. **签名校验（通用 HMAC-SHA-256）**：若 `auth.type=hmac`，按 `auth` 配置执行（见 5.1.1）；校验失败 → `401`。
  5. 封装事件对象（变量 + 原始体 + 头 + 查询）交给转发引擎。
  6. 先返回 `200`（避免外部系统因发送失败反复重试），发送成败写日志、可异步重试。

#### 5.1.1 通用 HMAC-SHA-256 验签器
端点 `auth` 抽象为**与来源无关的通用验签器**，开箱支持参考站点（Android SMS Gateway：`X-Signature` + hex + raw-body）以及 GitHub / GitLab 等：

- `type`：`none` | `hmac`（算法默认 `sha256`，可扩展 `sha1`/`sha512`）。
- `secret`：共享密钥（加密存储，见 11）。
- `header`：携带签名的请求头名，如 `X-Signature` / `X-Hub-Signature-256` / `Authorization`。
- `scheme`：签名在头值中的编码/格式：
  - `hex`（裸 hex，参考站点采用）
  - `base64`
  - `prefix:sha256=`（GitHub 风格：`sha256=<hex>`）
  - `prefix:sha1=`
  - `scheme:HMAC`（GitLab 风格：`HMAC <base64>`）
  - `scheme:Bearer`（`Bearer <hex>`）
- `signData`：被签名的内容来源：
  - `raw-body`（原始请求体字节，参考站点采用）
  - `raw-body+ts`（原始体拼接时间戳头，配合防重放）
  - `query`（排序后的查询串）
  - `header`（某个指定头的原始值）
- `timestampHeader` / `tolerance`（可选）：时间戳头与容差（秒），超期拒绝（防重放）。
- 比较：使用**恒定时间比较**，避免时序侧信道。

> 抽象收益：新增任意来源只需在端点配置里声明 `methods` / `parser` / `auth`，无需改代码；同一转发中心可同时接纳多种不同签名方案的来源。

### 5.2 转发引擎与 ForwardChannel 抽象（Forward Engine + Channels）
转发引擎的核心是一个**渠道无关的抽象层**：每一种"转发去向"都实现统一接口 `ForwardChannel`，引擎只负责"取事件 → 按 target 选 channel → 渲染 → 发送 → 记日志"，**不关心具体媒介**。因此新增 Phone / WebSocket / 企业微信等，只需实现接口并向注册表登记，引擎本身零改动。

**统一接口（概念签名）**
```ts
interface ForwardTarget {
  channel: string;        // 'email' | 'phone' | 'ws' | ... 决定走哪个 channel
  accountId?: number;     // 该渠道下的账号（如 email 的 SMTP 账号）
  to: string;             // 目标地址：邮箱 / 手机号 / ws 终端标识
  subjectTpl?: string;    // 标题模板（email 用；phone/ws 可忽略）
  bodyTpl: string;        // 正文模板，引用事件变量 {{field}}
  format?: 'text' | 'html';
}
interface ForwardResult { ok: boolean; detail?: string; }
interface OutgoingMessage { /* 渠道相关：email 为 {from,to,subject,text,html}；phone 为 {to,text}；ws 为 {topic,payload} */ }
interface ForwardChannel {
  type: string;                                       // 唯一渠道标识，如 'email'
  render(t: ForwardTarget, event: EventObject): OutgoingMessage; // 渠道相关格式化（模板渲染）
  send(msg: OutgoingMessage): Promise<ForwardResult>; // 实际投递
  health?(): Promise<boolean>;                        // 可选：健康检查
}
```

- 引擎行为：
  1. 读取 endpoint 绑定的 `targets`（每个 target 声明 `channel` + 渠道参数）。
  2. 按 `target.channel` 从**渠道注册表（Channel Registry）**取对应 `ForwardChannel` 实例。
  3. 调用 `channel.render()` 渲染该渠道的 `OutgoingMessage`（变量来自事件对象）。
  4. 调用 `channel.send()`；单目标失败不影响其余目标；可加重试（指数退避，最多 N 次）。
  5. 汇总各 target 结果，写入 `forward_logs`，更新 endpoint 统计。
- **渠道注册表**：启动时注册已实现渠道（`email`、`http`）；遇到未知 `channel` 的 target 直接记失败并告警。新增渠道只需 `register(new XxxChannel())`，引擎无需改动。

**计划中的渠道（接口已预留，当前未实现）**
- `PhoneChannel`：短信/语音，接 Twilio / 阿里云 / 腾讯云短信等；`send` 把 `bodyTpl` 经网关下发，`to` 为手机号。
- `WSChannel`：WebSocket 推送，向管理后台长连或对外 ws 终端实时推送事件；`send` 把 `OutgoingMessage` 序列化后发到 `topic`。

### 5.3 已实现的转发渠道（v1）
v1 同时实现两个渠道：**EmailChannel**（邮件，首批优先）与 **HttpChannel**（出站 HTTP 转发，本版新增）。两者均实现同一 `ForwardChannel` 接口，引擎调度方式完全一致。

#### 5.3.1 EmailChannel（邮件，v1）
- 实现 `ForwardChannel`，`type: 'email'`，v1 首批优先渠道。
- `render`：将 `subjectTpl` / `bodyTpl` 渲染为 `{ from, to, subject, text, html }`，`from` 取自 `accountId` 关联的邮箱账号。
- `send`：调用 `nodemailer` 经 SMTP 发送（适配器按渠道区分 SMTP 参数，见下表）。
- 账号表存储加密后的授权码；发送时解密注入 `nodemailer`。
- SMTP 参数（适配器）：

| 渠道 | SMTP Host | 端口 | 加密 | 认证方式 |
|------|-----------|------|------|----------|
| Gmail | `smtp.gmail.com` | 465 | SSL/TLS | 邮箱 + 应用专用密码 |
| QQ | `smtp.qq.com` | 465 | SSL/TLS | 邮箱 + 授权码 |
| 163 | `smtp.163.com` | 465 | SSL/TLS | 邮箱 + 授权码 |

#### 5.3.2 HttpChannel（出站 HTTP 转发，v1 新增）
收到 Webhook 后，用**特定表达式从入站事件中取出消息内容**，再以一次 HTTP 请求转发到别处（类似"出站 Webhook"）。同样实现 `ForwardChannel`，`type: 'http'`。

- `render`：根据 target 上的 HTTP 相关字段构造 `OutgoingMessage`（`{ method, url, headers, body }`）：
  - `url`：模板字符串，支持 `{{var}}` 引用事件变量；也支持在 URL 中嵌入表达式。
  - `method`：目标请求方法（`GET`/`POST`/`PUT`/`PATCH`/`DELETE`…），默认 `POST`。
  - `headers`：键值模板，支持 `{{var}}`（如鉴权头、自定义头）。
  - **消息内容抽取（`bodyExpr`）**：一个**表达式**（dot-path / JSONPath，复用入站解析器的取值器，零额外依赖）作用于入站事件，抽取出要转发的消息子树作为请求体；例如 `data.message`、`payload.items[0]`。
  - **消息体模板（`bodyTpl`）**：与 `bodyExpr` 二选一或组合——用 `{{var}}` 把抽取结果包进自定义结构（如 `{"text":"{{vars.text}}","from":"{{vars.from}}"}`）。
  - `contentType`：`application/json` / `application/x-www-form-urlencoded` / `text/plain`（决定 body 序列化方式）。
- `send`：用原生 `fetch` 发起出站请求；支持：
  - 可选**出站鉴权** `auth`：`none` / `bearer`(`{{token}}`) / `basic` / `hmac`（出站 HMAC-SHA-256 签名，复用 §5.1.1 的验签器思路反向签名，保护转发目标）。
  - `timeoutMs`（默认 10000）、`retries`（默认 3，指数退避）。
  - 2xx 视为成功；非 2xx / 超时 / 网络错误记失败并触发重试与日志。
- 设计要点：HttpChannel 让本系统既能"收 Webhook 发邮件"，也能"收 Webhook 再转发 Webhook"，成为通用事件路由中枢；抽取表达式与模板复用同一套变量机制，无需为不同来源写代码。

- 容错：单目标失败不影响其他目标；可加重试（指数退避，最多 N 次）。

### 5.4 资源管理 API（Admin API）
- 前缀 `/api`，全部受 Auth 保护。
- 端点（详见第 8 节）：
  - `endpoints`：子路径 CRUD + 启停
  - `accounts`：邮箱账号 CRUD（密码字段写入即加密，读取不返回明文）
  - `stats` / `logs`：仪表盘数据与转发日志
- 返回统一 JSON 结构：`{ ok, data, error }`。

### 5.5 持久化（可插拔：SQLite 默认 / PostgreSQL 可选）
- **统一数据访问层（DAL）**：业务通过 `repos` 接口读写，不感知底层方言。方言由 `DATABASE_URL` 决定：
  - 缺省 / `sqlite:./data/app.db` → `bun:sqlite`（文件库，零原生依赖，零配置）。
  - `postgres://user:pass@host:5432/db` → `postgres.js` + PostgreSQL（生产/高并发、可水平扩展）。
- **ORM**：采用 **Drizzle ORM** 双方言支持（同一套 schema 生成 `bun-sqlite` 与 `postgres-js` 两种方言），类型安全、无原生编译、Bun 友好、低风险。
- **迁移**：Drizzle Kit 生成迁移（push 或 migrate）；服务启动时确保表存在。
- 表：`email_accounts`、`endpoints`、`forward_logs`（详见第 7 节）。

### 5.6 WebUI（React 19 + Vite 7）
- 页面：
  - **登录**：管理员认证，获取会话 Cookie。
  - **仪表盘**：端点数、账号数、近期转发、成功率。
  - **子路径管理**：列表（标题/子路径/状态/渠道数）+ 新增/编辑抽屉（slug、标题、描述、启用、转发目标配置）。
  - **转发目标配置（按 channel 自适应表单）**：选 `email` 显示账号/收件人/主题/正文模板；选 `http` 显示 URL/方法/Headers/内容抽取表达式（`bodyExpr`）/消息体模板/出站鉴权；字段随 channel 动态切换。
  - **邮箱账号管理**：列表 + 新增/编辑（渠道下拉、邮箱、授权码、发件名）。
- 技术：TanStack Query 拉取/缓存，React Hook Form + Zod 校验，Tailwind 4 布局，**shadcn/ui 组件**（对话框/抽屉/下拉/Toast/表单/表格/卡片，经 `shadcn` CLI 初始化，组件源码纳入 `src/components/ui`），lucide 图标。
- 设计语言：深色优先、卡片化、留白充足、操作反馈清晰（基于 shadcn 设计 token，简洁精美、统一克制）。

### 5.7 认证与鉴权（Auth）
- 管理员密码：环境变量提供，启动时 scrypt 哈希；登录比对后签发 **HMAC 签名 Session Cookie**。
- 中间件：对 `/api/*` 与受保护页面校验会话；未登录重定向登录页。
- Webhook 端点本身：slug 即访问标识；每个端点可独立声明通用 HMAC-SHA-256 校验（见 5.1.1 / 5.8），无需全局改动即可适配任意来源的签名方案。

---

## 5.8 接入契约配置示例（通用化）

下面用两个真实来源展示"同一套配置模型"如何通用适配，无需为每种来源写代码。

### 示例 A — 参考站点：Android 短信网关（android_income_sms_gateway_webhook）
该 App 以 `POST` + `application/json` 发送，可选在 `X-Signature` 头放 **hex 格式 HMAC-SHA-256**（对原始 payload 签名，无前缀）。端点配置：

```json
{
  "subpath": "sms-inbox",
  "title": "Android 短信网关",
  "methods": ["POST"],
  "parser": {
    "source": "body", "contentType": "json",
    "mapping": { "from": "from", "text": "text", "sim": "sim", "receivedAt": "receivedStamp" }
  },
  "auth": {
    "type": "hmac", "algorithm": "sha256",
    "header": "X-Signature", "scheme": "hex", "signData": "raw-body"
  },
  "targets": [
    { "accountId": 1, "to": "me@example.com",
      "subjectTpl": "短信来自 {{from}}", "bodyTpl": "{{text}}" }
  ]
}
```

### 示例 B — GitHub 风格 Webhook
GitHub 在 `X-Hub-Signature-256` 头放 `sha256=<hex>`，对原始体签名。端点配置：

```json
{
  "subpath": "gh-events",
  "methods": ["POST"],
  "parser": {
    "source": "body", "contentType": "json",
    "mapping": { "action": "action", "repo": "repository.full_name" }
  },
  "auth": {
    "type": "hmac", "algorithm": "sha256",
    "header": "X-Hub-Signature-256", "scheme": "prefix:sha256=", "signData": "raw-body"
  }
}
```

> 任何新来源（GitLab、自定义后台、IoT 设备等）均按此模型声明 `methods` / `parser` / `auth` 即可接入；`secret` 在写入时加密存储，接口读出不返回明文。

---

## 6. 数据流

### 6.1 管理配置流（Admin 配置）
```
管理员 → 登录 → 新增邮箱账号(Gmail/QQ/163) → 保存(授权码加密)
        → 新增子路径(slug/标题/描述) → 绑定转发目标(选账号+收件人+主题模板) → 保存
        → 端点上线(active=true)
```

### 6.2 触发转发流（Inbound Webhook）
```
外部系统 任意方法 /wh/:subpath (body/query/headers)
   → Webhook Receiver 方法匹配（methods 白名单，否则 405）
   → 查 endpoints（不存在/未启用 → 404/410）
   → 体解析 parser：按 source/contentType/mapping 归一为事件对象（变量）
   → HMAC 验签 auth（失败 → 401；恒定时间比较，可选时间戳防重放）
   → 转发引擎 渲染模板（主题/正文，引用变量）
   → 遍历转发目标 → 邮件渠道服务 → nodemailer → SMTP → 收件人邮箱
   → 写 forward_logs（成功/失败/错误）
   → 返回 200 给外部系统（异步/尽力发送）
```

> 图形化时序见 `architecture-diagram.html` 的"数据流"部分。

---

## 7. 数据模型（Drizzle Schema，SQLite / PostgreSQL 双方言）

> 以下以 SQLite 方言直观展示表结构；实际由 Drizzle schema 定义，编译期同时生成 PostgreSQL 方言，字段类型与约束保持一致（自增主键、时间戳默认值的方言差异由 Drizzle 处理）。

```sql
-- 邮箱账号（按渠道）
CREATE TABLE email_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,            -- 'gmail' | 'qq' | '163' | ...
  name        TEXT NOT NULL,            -- 展示名
  email       TEXT NOT NULL,            -- 发件邮箱
  from_name   TEXT,                     -- 发件人显示名
  secret_enc  TEXT NOT NULL,            -- 加密后的授权码/应用密码
  host        TEXT NOT NULL,            -- 可覆盖默认 SMTP
  port        INTEGER NOT NULL,
  secure      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Webhook 子路径端点
CREATE TABLE endpoints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subpath     TEXT NOT NULL UNIQUE,     -- 唯一 slug
  title       TEXT NOT NULL,
  description TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  methods     TEXT NOT NULL DEFAULT '["POST"]',  -- 允许的方法白名单，或 ["*"]
  parser      TEXT,                     -- JSON: {source, contentType, mapping}
  auth        TEXT,                     -- JSON: {type, algorithm, header, scheme, signData, ...}
  targets     TEXT NOT NULL,            -- JSON: [{accountId, to, subjectTpl, bodyTpl, format}]
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 转发日志
CREATE TABLE forward_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id INTEGER,
  account_id  INTEGER,
  to_addr     TEXT,
  status      TEXT NOT NULL,            -- 'success' | 'failed'
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id),
  FOREIGN KEY (account_id) REFERENCES email_accounts(id)
);
CREATE INDEX idx_logs_endpoint ON forward_logs(endpoint_id);
CREATE INDEX idx_logs_created  ON forward_logs(created_at);
```

---

## 8. API 设计（摘要）

基础前缀 `/api`，统一响应 `{ ok: boolean, data?, error? }`，需 Session Cookie。

### 8.1 认证
- `POST /api/login` `{ password }` → 设置 Session Cookie
- `POST /api/logout`
- `GET  /api/me` → 当前会话状态

### 8.2 子路径端点
- `GET    /api/endpoints` → 列表（含统计）
- `POST   /api/endpoints` → 新增 `{ subpath, title, description, active, methods, parser, auth, targets }`
- `GET    /api/endpoints/:id` → 详情
- `PUT    /api/endpoints/:id` → 更新（同字段；parser/auth 可部分更新）
- `DELETE /api/endpoints/:id` → 删除
- `POST   /api/endpoints/:id/toggle` → 启停

### 8.3 邮箱账号
- `GET    /api/accounts` → 列表（**不含明文 secret**）
- `POST   /api/accounts` → 新增 `{ channel, name, email, from_name, secret, host?, port?, secure? }`
- `PUT    /api/accounts/:id` → 更新（secret 可选，传则更新）
- `DELETE /api/accounts/:id` → 删除

### 8.4 统计与日志
- `GET /api/stats` → `{ endpoints, accounts, success, failed, recent[] }`
- `GET /api/logs?endpointId=&status=&limit=` → 转发日志

> 所有请求体用 Zod 校验；`subpath` 仅允许 `[a-z0-9-_]` 且全局唯一；`methods` / `auth.scheme` / `auth.signData` 为枚举白名单；`auth.secret` 写入即加密、读出不返回明文。

---

## 9. 推荐目录结构

```
webhook-backend/                 # Bun workspace 根
├── package.json                 # workspaces: ["web","server"]
├── docker-compose.yml
├── Dockerfile                   # 多阶段：构建 web → 运行 server
├── README.md
├── web/                         # React 19 + Vite 7 管理后台
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts       # Tailwind 4 用 CSS-first，可省
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx              # 路由
│   │   ├── pages/               # Login / Dashboard / Endpoints / Accounts
│   │   ├── components/          # 业务组件 + ui/（shadcn/ui 生成的按钮/表单/对话框/抽屉/表格/Toast）
│   │   └── lib/                 # api client + zod schemas (与 server 共享)
│   └── package.json
├── server/                      # Bun + Hono 后端
│   ├── src/
│   │   ├── index.ts             # 启动：挂载路由 + 静态托管
│   │   ├── routes/
│   │   │   ├── webhook.ts       # POST /wh/:subpath
│   │   │   ├── endpoints.ts     # /api/endpoints
│   │   │   ├── accounts.ts      # /api/accounts
│   │   │   ├── stats.ts         # /api/stats, /api/logs
│   │   │   └── auth.ts          # /api/login, /api/me
│   │   ├── services/
│   │   │   ├── forward-engine.ts   # 引擎：取事件→按 target.channel 选 channel→渲染→发送→记日志
│   │   │   ├── channels/
│   │   │   │   ├── types.ts        # ForwardChannel / ForwardTarget / OutgoingMessage 接口
│   │   │   │   ├── registry.ts     # 渠道注册表（启动注册已实现渠道）
│   │   │   │   ├── email.ts        # EmailChannel（v1：SMTP + nodemailer）
│   │   │   │   ├── http.ts         # HttpChannel（v1：出站 HTTP 转发 + 表达式抽取）
│   │   │   │   ├── phone.ts        # PhoneChannel（预留，未实现）
│   │   │   │   └── ws.ts           # WSChannel（预留，未实现）
│   │   │   └── crypto.ts        # AES-GCM 加解密 + scrypt
│   │   ├── db/
│   │   │   ├── index.ts         # DAL：SQLite/Postgres 连接 + 迁移（Drizzle）
│   │   │   ├── schema.ts        # Drizzle schema（双方言）
│   │   │   └── repos.ts         # endpoints/accounts/logs 仓储（方言无关）
│   │   ├── middleware/          # auth, error, logger
│   │   └── schemas.ts           # Zod（与 web 共享）
│   └── package.json
└── packages/shared/             # （可选）前后端共享类型/Zod
```

---

## 10. 部署方案（Docker）

### 10.1 多阶段 Dockerfile（要点）
```dockerfile
# ---- 构建前端 ----
FROM oven/bun:1 AS web
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install
COPY web/ ./
RUN bun run build                # 产物 → dist/

# ---- 运行服务 ----
FROM oven/bun:1 AS run
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/bun.lock ./
RUN bun install --production
COPY server/ ./server/
COPY --from=web /app/web/dist ./server/public   # 静态托管目录
COPY data ./data                                 # 或运行时建卷
EXPOSE 3000
CMD ["bun", "run", "server/src/index.ts"]
```
> 健康检查：`HEALTHCHECK CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1))"`。

### 10.2 docker-compose.yml（要点）
```yaml
services:
  webhook:
    build: .
    ports: ["3000:3000"]
    environment:
      PORT: "3000"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"      # 管理员密码
      ENCRYPT_KEY: "${ENCRYPT_KEY}"            # 32字节 base64，用于授权码加密
      DATABASE_URL: "${DATABASE_URL}"          # 留空=SQLite(./data/app.db)；可填 postgres://... 切到 PostgreSQL
      CORS_ORIGIN: "*"
    volumes:
      - ./data:/app/data                        # SQLite 持久化（仅默认方言需要）
    restart: unless-stopped
```

### 10.3 配置项（环境变量）
| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 3000 |
| `ADMIN_PASSWORD` | 管理员登录密码（运行时 scrypt 哈希） |
| `ENCRYPT_KEY` | 授权码加密密钥（AES-GCM，建议 32 字节 base64） |
| `CORS_ORIGIN` | 跨域来源（同源部署可留空） |
| `DATABASE_URL` | 数据库连接串；留空默认 SQLite `./data/app.db`；填 `postgres://...` 切换 PostgreSQL（无需数据卷） |

---

## 11. 安全设计

1. **授权码加密存储**：邮箱授权码用 `AES-GCM` 加密（密钥来自 `ENCRYPT_KEY`），DB 中仅存密文；读取 API 不返回明文。
2. **管理后台认证**：管理员密码 scrypt 哈希 + HMAC 签名 Session Cookie；`/api/*` 强制校验。
3. **Webhook 端点签名校验**：每个端点可启用通用 HMAC-SHA-256；验签用恒定时间比较，可选时间戳头 + 容差防重放；secret 加密存储，不进日志。
4. **最小日志**：日志只记状态与脱敏错误，绝不记录授权码、请求体中的敏感字段可选脱敏。
5. **输入校验**：所有 `subpath`、请求体经 Zod 校验，防注入/越界。
6. **Docker 加固**：非 root 运行、只读根文件系统（如可行）、仅暴露必要端口、数据卷隔离。
7. **SMTP 安全**：强制 TLS（465/SSL），不降级到明文。

---

## 12. 风险、注意点与后续扩展

### 12.1 当前风险 / 注意点
- **授权码 vs 密码**：Gmail/QQ/163 均需"应用专用密码/授权码"，非登录密码；文档与 UI 需明确引导用户开启 IMAP/SMTP 并生成授权码。
- **发送频率限制**：免费邮箱有每日/每分钟发送上限，需做限流与队列（v1 可先做简单串行+重试，后续引入队列）。
- **单次 200 语义**：为避免外部系统因发送失败反复重试，接收端先回 200，失败走日志/异步重试；需向用户说明"成功接收 ≠ 成功送达"。
- **依赖稳定性**：锁定 minor 版本，CI 中固定 `bun.lock`，避免 `latest` 漂移。

### 12.2 后续可扩展
- 新增转发渠道：均实现 `ForwardChannel` 并向注册表登记即可——Telegram / 企业微信 / 钉钉 / Slack / 自定义 Webhook（其中 Phone/WS 接口已在 §5.2 预留）。
- 异步队列（Bun 内置 worker / Redis）解耦接收与发送，支持重试与背压；引擎可在 `send` 外层加队列封装而不改 channel。
- 子路径级签名校验、IP 白名单。
- 邮件模板可视化编辑器（HTML 模板 + 变量提示）。
- 多用户与角色权限。
- 指标暴露（Prometheus）与告警。

---

## 13. 建议开发里程碑

1. **M1 脚手架**：Bun workspace + Vite7/React19 前端 + Hono 后端 + 类型共享。
2. **M2 持久化与账号**：DAL（SQLite/Postgres，Drizzle schema）+ 账号 CRUD + 授权码加解密。
3. **M3 子路径与接收**：endpoints CRUD + `POST /wh/:subpath` 接收 + 转发引擎骨架。
4. **M4 转发通道**：`ForwardChannel` 抽象 + `EmailChannel`（Gmail/QQ/163，nodemailer）+ `HttpChannel`（出站 HTTP 转发 + 表达式抽取 + 出站鉴权）发送 + 日志；预留 `PhoneChannel` / `WSChannel` 接口。
5. **M5 WebUI**：登录、仪表盘、子路径管理、账号管理页。
6. **M6 部署**：Dockerfile + compose + 健康检查 + 文档。
7. **M7 加固**：限流/重试、签名校验（可选）、压测。

---

_附：图形化架构与数据流见同目录 `architecture-diagram.html`；开发进度、决策日志与下一步计划见同目录 `PROGRESS.md`。_
