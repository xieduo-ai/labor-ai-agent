"use client";

import { useMemo, useState } from "react";
import type { JudgmentCase } from "@/data/caseRefs";

const LEVEL_LABEL: Record<string, string> = { A: "最高法/官方原文", B: "官方汇总", C: "公开解读" };
const KIND_LABEL: Record<string, string> = {
  official: "官方单案原文",
  digest: "官方渠道汇总",
  commentary: "公开解读",
  index: "案例库检索入口",
};

/**
 * 首页「典型劳动争议案例」区块：静态闭集展示 32 条真实案例中的代表案例，
 * 按争议类型筛选，未登录也能浏览（对应教师建议四「不问也能看到案例」）。
 * 案例不参与语义检索、不由模型生成，延续项目「结论敢被人查」的零幻觉叙事。
 */
export function HomeCases({ cases }: { cases: JudgmentCase[] }) {
  const [cat, setCat] = useState("全部");

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return [{ name: "全部", n: cases.length }, ...[...m.entries()].map(([name, n]) => ({ name, n }))];
  }, [cases]);

  const shown = useMemo(() => {
    const list = cat === "全部" ? cases : cases.filter((c) => c.category === cat);
    return list.slice(0, 6);
  }, [cases, cat]);

  return (
    <section className="bg-[#0b1728] pb-20 pt-4">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl font-bold text-white">典型劳动争议案例</h2>
        <p className="mt-2 text-center text-sm text-white/50">
          32 条真实裁判案例闭集展示（案号 / 法院 / 要旨可核验），不靠模型编造
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {cats.map((c) => (
            <button
              key={c.name}
              onClick={() => setCat(c.name)}
              className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                cat === c.name
                  ? "bg-worker text-white"
                  : "border border-white/15 bg-white/5 text-white/70 hover:border-white/30"
              }`}
            >
              {c.name} <span className="opacity-60">{c.n}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <a
              key={c.id}
              href={c.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-worker/50 hover:bg-white/[0.08]"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  {c.category}
                </span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
                  {c.level} · {LEVEL_LABEL[c.level]}
                </span>
              </div>
              <div className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-snug text-white">
                {c.title}
              </div>
              <div className="mt-1 text-[11px] text-white/45">
                {c.caseNo} · {c.court}
              </div>
              <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-white/65">
                {c.holding}
              </div>
              <div className="mt-2 rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-emerald-200">
                {c.result}
              </div>
              <div className="mt-auto pt-2 text-[10.5px] leading-relaxed text-sky-200/70">
                相似点：{c.similarity}
              </div>
              <div className="mt-2 text-[10px] text-white/35">
                来源：{c.source} · {KIND_LABEL[c.sourceKind]}
                {c.note ? ` · ${c.note}` : ""}
              </div>
            </a>
          ))}
        </div>
        <p className="mt-5 text-center text-[11px] text-white/35">
          点击卡片可打开原始出处核验 · 更多案例在智能助手页右侧「相关资料 → 类案」中按问检索
        </p>
      </div>
    </section>
  );
}
