import type { NextConfig } from "next";

// 两种部署共用一份配置：
//  - 默认（Railway / 本地 dev）：Node 服务，启用组件级缓存与路由预取
//  - STATIC_EXPORT=1：纯静态导出到 out/，由 FastAPI 单进程同源托管（备用镜像用）
// 切换成静态导出时必须关掉 cacheComponents / headers()——两者依赖服务端运行时。
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        // 纯静态托管没有 /_next/image 服务端优化路由，必须让 next/image
        // 直接输出原始图片路径（/hero-*.webp），否则首页两张剪影会 404。
        images: { unoptimized: true },
      }
    : { cacheComponents: true, partialPrefetching: true }),

  // Next 16 对带内容哈希的 /_next/static 产物默认就是 immutable 强缓存，
  // 这里不重复覆盖 Cache-Control（自定义会破坏 dev 热更新）。
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
              ],
            },
          ];
        },
      }),

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
