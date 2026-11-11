"use client";

import { useEffect } from "react";

/**
 * 劳动法问答已并入「智能助手」（/agent）：快速问答降级为 /agent 页内的
 * 「快速问答 / 深度分析」模式切换。此路由只做重定向，避免旧分享链接、书签 404。
 */
export default function WorkerChatRedirect() {
  useEffect(() => {
    window.location.replace("/agent");
  }, []);
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
      正在跳转到「智能助手」…
    </div>
  );
}
