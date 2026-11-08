"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "首页" },
  { href: "/agent", label: "智能助手", icon: "🤖" },
  { href: "/worker/chat", label: "劳动法问答" },
  { href: "/review", label: "审合同", icon: "📄" },
  { href: "/worker/calculator", label: "赔偿计算器" },
];

/**
 * 全站导航。左侧 logo 一直可以回首页，但没有任何视觉提示，
 * 用户点进功能页后找不到返回入口——所以显式加一个「首页」项，
 * 并用 usePathname 高亮当前所在页，让「我在哪 / 怎么回去」一眼可见。
 *
 * 抽成客户端组件是为了让 layout 保持服务端渲染，同时把路由状态收敛在导航内部。
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
      <Link
        href="/"
        title="返回首页"
        aria-label="返回首页"
        className="group flex shrink-0 items-center gap-2 font-bold text-brand"
      >
        <span className="text-xl">⚖️</span>
        <span className="text-sm underline-offset-4 group-hover:underline sm:text-base">
          用工合规 AI
        </span>
      </Link>

      <nav className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs sm:gap-4 sm:text-sm">
        {NAV.map((item) => {
          // 「/」必须精确匹配，否则所有页面都会被标成首页
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 rounded-md px-2 py-2 transition-colors sm:px-2.5 ${
                active
                  ? "font-medium text-brand"
                  : "text-slate-500 hover:text-brand"
              }`}
            >
              {item.icon && <span className="hidden sm:inline">{item.icon} </span>}
              {item.label}
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#B86320] to-[#2563eb]" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
