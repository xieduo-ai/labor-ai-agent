import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "用工合规 AI Agent · 让每一份劳动合同都经得起仲裁",
  description:
    "面向中小企业与劳动者的智能合规助手：上传合同逐条审查风险，劳动法问答带法条引用，赔偿金一键计算。",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-brand">
              <span className="text-xl">⚖️</span>
              <span>用工合规 AI</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm">
              <Link href="/agent" className="hover:text-brand transition-colors">
                🤖 智能助手
              </Link>
              <Link href="/worker/chat" className="hover:text-worker transition-colors">
                劳动法问答
              </Link>
              <Link href="/review" className="hover:text-brand transition-colors">
                📄 审合同
              </Link>
              <Link href="/worker/calculator" className="hover:text-worker transition-colors">
                赔偿计算器
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          仅供学习研究，不构成法律意见 · 知识库覆盖 14 部劳动法规 / 678 条
        </footer>
      </body>
    </html>
  );
}
