# Next.js 前端镜像：Railway 部署时 Root Directory 设为 frontend/
# NEXT_PUBLIC_API_BASE 是构建期变量（Next.js 会把它内联进客户端代码），必须在 build 之前注入
FROM node:22-alpine

WORKDIR /app

# 先装依赖，利用 Docker 层缓存：只有 package.json/lock 变化才重装
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Railway 注入 $PORT，不能硬编码
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
