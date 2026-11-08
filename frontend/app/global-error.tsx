"use client";

/** 根布局也崩了时的最后一层兜底，必须自带 html/body。 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>应用暂时无法加载</h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>
            界面初始化失败（{error.message || "未知错误"}）。刷新或稍后再试；
            本项目不存储用户上传的合同，重试不会造成数据丢失。
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "10px 24px",
              borderRadius: 999,
              border: "none",
              background: "#1e3a5f",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
