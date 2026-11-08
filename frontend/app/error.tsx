"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * 路由级错误边界（Next.js App Router 约定文件）。
 * SSE 请求失败由各页自己处理并展示；这里兜的是渲染期崩溃，
 * 给一个能重试的中文页面，而不是浏览器默认的白屏堆栈。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[页面错误]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="mt-4 text-xl font-bold text-slate-900">页面出了点问题</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        这不是法律结论出错，只是界面渲染中断了。你的合同内容没有上传给第三方。
        可以点下方重试；如果反复出现，刷新页面或换用「劳动法问答」页继续。
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        重试
      </button>
      <Link href="/" className="mt-3 text-xs text-slate-400 hover:text-brand">
        返回首页
      </Link>
    </div>
  );
}
