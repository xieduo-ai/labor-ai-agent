import type { ReactNode } from "react";

/**
 * 路由级进入动画。
 *
 * App Router 的 template 会在每次导航时重新挂载（layout 不会），
 * 所以用它承载页面切换动效比在每个页面各写一份更可靠，也不会被页面缓存吃掉。
 * 动画本体在 globals.css 的 .page-enter / .page-enter-bar，
 * 顶部那条黄→蓝渐变线与首屏左右双栏呼应。
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <div className="page-enter flex flex-1 flex-col">
      <div className="page-enter-bar" aria-hidden="true" />
      {children}
    </div>
  );
}
