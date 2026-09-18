# 菇事云管家 · 长期运行镜像（Express API + 小程序 H5 静态页，单端口 3000）
#
# 构建上下文是 scripts/prep-deploy.js 组装出来的 _deploy/ 目录：
#   cd _deploy && docker compose up -d --build
#
# 两个刻意的选择：
#   1) 基础镜像用 bookworm-slim（glibc）而不是 alpine：better-sqlite3 的原生二进制在 musl 下要现场编译，
#      构建更慢也更容易失败；
#   2) node_modules 不打进镜像，由 npm ci 按 package-lock.json 精确安装，保证多次构建结果一致。
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    H5_DIST=dist-h5 \
    TZ=Asia/Shanghai

# 时区数据：容器默认 UTC，不装 tzdata 时 TZ 不生效，日志和页面时间会差 8 小时。
# 国内服务器构建慢的话，可在下面 apt-get update 前插入：
#   sed -i 's|deb.debian.org|mirrors.tencent.com|g' /etc/apt/sources.list.d/debian.sources
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依赖单独一层：只要 lock 文件不变，改业务代码时不会重装依赖
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# 数据目录（数据库、jwt.secret、备份）与上传目录都由 compose 以卷挂载到宿主机，
# 这里只保证路径存在且容器内的 node 用户可写。
RUN mkdir -p /app/server/data /app/public/uploads && chown -R node:node /app
USER node

EXPOSE 3000

# 供 compose / 监控探活；/api/health 是公开接口，不需要登录
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/app.js"]
