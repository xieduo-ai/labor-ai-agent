import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
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
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur">
          <SiteNav />
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-white/10 bg-[#081020] py-6 text-center text-xs text-white/40">
          仅供学习研究，不构成法律意见 · 知识库覆盖 14 部劳动法规 / 678 条
        </footer>
      </body>
    </html>
  );
}
