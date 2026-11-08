import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,          // Next 的组件级缓存
  partialPrefetching: true,       // 路由预取只取需要的部分，减少首屏传输

  // 缓存策略说明：Next 16 对带内容哈希的 /_next/static 产物默认就是
  // immutable 强缓存，这里**不重复覆盖** Cache-Control（自定义会破坏 dev 热更新）；
  // 组件级缓存走 cacheComponents，路由预取走 partialPrefetching，
  // 可选语音模块走 next/dynamic 按需分包。页面 HTML 不缓存，保证 SSE 与前端一致。
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
