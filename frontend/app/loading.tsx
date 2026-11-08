/** 路由切换时的骨架屏：先给结构，避免白屏，也让加载状态可感知。 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-4 py-10">
      <div className="h-7 w-56 rounded-lg bg-slate-200" />
      <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="h-80 rounded-2xl bg-slate-100" />
        <div className="h-80 rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-4 text-center text-xs text-slate-400">正在加载页面…</div>
    </div>
  );
}
