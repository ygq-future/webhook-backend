# syntax=docker/dockerfile:1

##########################################################################
# 阶段 1：构建（安装依赖 + 构建前端）
##########################################################################
FROM oven/bun:1 AS builder
WORKDIR /app

# 先拷贝各包的清单以最大化利用缓存层
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY web/package.json web/
COPY server/package.json server/

RUN bun install --frozen-lockfile

# 拷贝源码并构建前端（产物在 web/dist）
COPY . .
RUN bun run build:web

##########################################################################
# 阶段 2：运行时（仅保留运行所需文件）
##########################################################################
FROM oven/bun:1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=sqlite:./data/app.db \
    WEB_ROOT=./web/dist

# 从构建阶段拷贝依赖、后端源码、共享包与前端产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/server ./server
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/package.json ./package.json

# SQLite 数据目录（可挂载卷持久化）
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000

# 健康检查（slim 镜像无 curl，用 bun 原生 fetch）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 直接以 Bun 运行 TS 入口（避免打包 nodemailer/postgres 的动态 require 问题）
CMD ["bun", "run", "server/src/index.ts"]
