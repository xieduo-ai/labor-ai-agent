"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CASE_CATEGORIES,
  COMMON_DISPUTES,
  JUDGMENT_CASES,
  type JudgmentCase,
  type SourceKind,
  type SourceLevel,
} from "@/data/caseRefs";

/** 本次 Agent 真正检索命中的法条（闭集，来自 search_law 工具返回值） */
export interface RelatedLaw {
  law: string;
  article: string;
  text: string;
}

type Tab = "law" | "dispute" | "case";

/** 来源类型 → 徽章与链接文案。绝不把「汇总页 / 解读 / 检索入口」写成官方原文。 */
const KIND_META: Record<
  SourceKind,
  { label: string; badge: string; dot: string; link: string }
> = {
  official: {
    label: "官方单案原文",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    link: "查看官方原文",
  },
  digest: {
    label: "官方渠道汇总 / 转载",
    badge: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    link: "查看来源页面",
  },
  commentary: {
    label: "公开解读·非官方",
    badge: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    link: "查看公开解读（非官方）",
  },
  index: {
    label: "检索入口·无单案页",
    badge: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    link: "前往案例库按案号检索",
  },
};

const LEVEL_HINT: Record<SourceLevel, string> = {
  A: "A 级·可直接点开原文",
  B: "B 级·官方渠道，按案号复核",
  C: "C 级·案号可核，公开直链待补",
};

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

/** 紧凑结果卡：一屏能铺多条；点开才展开事实 / 结果 / 相似点 / 出处 */
function CaseCard({ item }: { item: JudgmentCase }) {
  const [open, setOpen] = useState(false);
  const kind = KIND_META[item.sourceKind];
  const brief =
    item.holding.length > 68 ? `${item.holding.slice(0, 68)}…` : item.holding;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm">
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[12.5px] font-medium leading-snug text-slate-900">
            {item.title}
          </div>
          <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
            {open ? "收起" : "展开"}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kind.badge}`}>
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${kind.dot}`} />
            {kind.label}
          </span>
          <span className="text-[10px] text-slate-400">{item.level} 级</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
            {item.category}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2 text-[10.5px] leading-relaxed text-slate-500">
          <span>{item.caseNo}</span>
          <span>{item.court}</span>
          <span>{item.date}</span>
        </div>
      </button>

      <div className="mt-2 rounded-lg bg-amber-50/70 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
        <span className="font-medium">裁判要旨 · </span>
        {brief}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="text-[11px] leading-relaxed text-slate-600">
            <div className="font-medium text-slate-700">裁判要旨（完整）</div>
            <div className="mt-1">{item.holding}</div>
          </div>
          <div className="text-[11px] leading-relaxed text-slate-600">
            <div className="font-medium text-slate-700">关键事实</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {item.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
            结果：{item.result}
          </div>
          <div className="rounded-lg bg-blue-50 p-2.5 text-[11px] leading-relaxed text-blue-900">
            <span className="font-medium">与你情况的相似点 · </span>
            {item.similarity}
          </div>
          {item.note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10.5px] leading-relaxed text-amber-800">
              <span className="font-medium">来源说明 · </span>
              {item.note}
            </div>
          )}
          <div className="text-[10px] text-slate-400">
            来源：{item.source} · {LEVEL_HINT[item.level]}
          </div>
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[11px] text-brand hover:underline"
          >
            {kind.link} ↗
          </a>
        </div>
      )}
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
  // 未提问时默认展示「类案」：32 条真实案例 + 带数量的分组直接铺在首屏，
  // 不必让用户先点一下 Tab 才看到资料（借鉴得理法搜的结果卡信息架构）。
  const defaultTab: Tab = JUDGMENT_CASES.length > 0 ? "case" : "dispute";
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [category, setCategory] = useState<string>("all");

  // 一旦本次提问检索到真实法条，自动切到「法规」Tab —— 这是老师最想看的依据层，
  // 不该让用户手动点一下才出现；新建对话后回到类案。
  useEffect(() => {
    if (laws.length > 0) setTab("law");
    else setTab(defaultTab);
  }, [laws.length, defaultTab]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of JUDGMENT_CASES) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, []);

  const visibleCases = useMemo(
    () =>
      category === "all"
        ? JUDGMENT_CASES
        : JUDGMENT_CASES.filter((c) => c.category === category),
    [category],
  );

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

      {tab === "case" && JUDGMENT_CASES.length > 0 && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
          <div className="mb-1.5 text-[10px] leading-relaxed text-slate-500">
            {JUDGMENT_CASES.length} 条真实案例 · 闭集静态展示，不参与检索与模型生成。
            徽章按来源类型区分，标注「需复核」的请按案号核对。
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCategory("all")}
              className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                category === "all"
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              全部 {JUDGMENT_CASES.length}
            </button>
            {CASE_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  category === c
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c} {categoryCounts.get(c) ?? 0}
              </button>
            ))}
          </div>
        </div>
      )}

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
            visibleCases.map((c) => <CaseCard key={c.id} item={c} />)
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
