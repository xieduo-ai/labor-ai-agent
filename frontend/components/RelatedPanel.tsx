"use client";

import { useEffect, useState } from "react";
import { COMMON_DISPUTES, JUDGMENT_CASES, type JudgmentCase } from "@/data/caseRefs";

/** 本次 Agent 真正检索命中的法条（闭集，来自 search_law 工具返回值） */
export interface RelatedLaw {
  law: string;
  article: string;
  text: string;
}

type Tab = "law" | "dispute" | "case";

function LawCard({ item, index }: { item: RelatedLaw; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-medium text-slate-500">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-snug text-slate-900">
            {item.law}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              已核验
            </span>
            <span className="text-[11px] text-slate-500">{item.article}</span>
            <span className="text-[10px] text-slate-400">本次检索命中</span>
          </div>
        </div>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="mt-2 w-full text-left text-[11px] text-brand hover:underline"
      >
        {open ? "收起原文" : "查看条文原文"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
          {item.text}
        </div>
      )}
    </div>
  );
}

function DisputeCard({
  item,
  onAsk,
}: {
  item: (typeof COMMON_DISPUTES)[number];
  onAsk: (q: string) => void;
}) {
  return (
    <button
      onClick={() => onAsk(item.question)}
      className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-all hover:border-brand/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
          {item.category}
        </span>
        <span className="text-[10px] text-slate-400">评测集 #{item.id}</span>
      </div>
      <div className="mt-2 text-[13px] leading-snug text-slate-800">{item.question}</div>
      <div className="mt-2 text-[11px] text-slate-400">
        关联法条 {item.articles.length} 条 · 点击直接提问
      </div>
    </button>
  );
}

function CaseCard({ item }: { item: JudgmentCase }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-[13px] font-medium leading-snug text-slate-900">{item.title}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span>{item.caseNo}</span>
        <span>·</span>
        <span>{item.court}</span>
        <span>·</span>
        <span>{item.date}</span>
      </div>
      <div className="mt-2 rounded-lg bg-amber-50 p-2.5">
        <div className="text-[11px] font-medium text-amber-900">裁判要旨</div>
        <div className="mt-1 text-[11px] leading-relaxed text-amber-800">{item.holding}</div>
      </div>
      <div className="mt-2 text-[11px] text-slate-600">结果：{item.result}</div>
      <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
        <span className="font-medium text-slate-700">与你情况的相似点：</span>
        {item.similarity}
      </div>
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-[11px] text-brand hover:underline"
      >
        查看官方原文 · {item.source} ↗
      </a>
    </div>
  );
}

/** 空态：宁可如实说没有，也不编案例 */
function CaseEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <div className="text-[13px] font-medium text-slate-700">尚未接入裁判案例</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        类案须附真实案号、审理法院与官方原文链接，供评委点开核验。
        在取得可核验来源之前，本栏保持为空，不使用模型生成的示例案件。
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        当前展示的「常见争议」来自本项目自建 40 题口语化评测集，可用仓库脚本复现，
        但它们是评测题，不是判例。
      </p>
    </div>
  );
}

export function RelatedPanel({
  laws,
  onAsk,
  onClose,
}: {
  laws: RelatedLaw[];
  onAsk: (q: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dispute");

  // 一旦本次提问检索到真实法条，自动切到「法规」Tab —— 这是老师最想看的依据层，
  // 不该让用户手动点一下才出现。
  useEffect(() => {
    if (laws.length > 0) setTab("law");
    else setTab("dispute");
  }, [laws.length]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "law", label: "法规", count: laws.length },
    { key: "dispute", label: "常见争议", count: COMMON_DISPUTES.length },
    { key: "case", label: "类案", count: JUDGMENT_CASES.length },
  ];

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-slate-50/70">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="text-[13px] font-medium text-slate-800">相关资料</div>
        <button
          onClick={onClose}
          aria-label="关闭相关资料"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          ×
        </button>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-slate-200 px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              tab === t.key
                ? "bg-brand text-white"
                : "text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            }`}
          >
            {t.label}
            <span className={tab === t.key ? "ml-1 text-white/70" : "ml-1 text-slate-400"}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {tab === "law" &&
          (laws.length ? (
            laws.map((l, i) => <LawCard key={`${l.law}-${l.article}-${i}`} item={l} index={i + 1} />)
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-[11px] leading-relaxed text-slate-500">
              本次提问尚未检索法条。
              <br />
              提问后，Agent 实际命中的条文会逐条列在这里，供你点开核对原文。
            </div>
          ))}

        {tab === "dispute" && (
          <>
            <div className="rounded-lg bg-blue-50 px-2.5 py-2 text-[10px] leading-relaxed text-blue-800">
              以下为本项目自建 40 题口语化评测集中的高频争议，用于演示常见问法，
              可用仓库脚本复现；不是裁判案例。点击即可提问。
            </div>
            {COMMON_DISPUTES.map((d) => (
              <DisputeCard key={d.id} item={d} onAsk={onAsk} />
            ))}
          </>
        )}

        {tab === "case" &&
          (JUDGMENT_CASES.length ? (
            JUDGMENT_CASES.map((c) => <CaseCard key={c.caseNo} item={c} />)
          ) : (
            <CaseEmpty />
          ))}
      </div>

      <div className="shrink-0 border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400">
        资料仅作辅助参考，不构成法律意见
      </div>
    </aside>
  );
}
