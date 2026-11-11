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

/** 全量浏览用的紧凑案例卡（仅未提问时展示） */
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

/** 本次问题的相关类案卡：对标「类案参考 · 和你情况相似的真实判例」 */
function RelatedCaseCard({ item }: { item: JudgmentCase }) {
  const kind = KIND_META[item.sourceKind];
  return (
    <a
      href={item.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-white bg-white p-3 transition-colors hover:border-sky-300"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          {item.category}
        </span>
        <span className="text-[10px] text-slate-400">
          {item.level} · {item.caseNo}
        </span>
      </div>
      <div className="mt-1.5 text-[12.5px] font-medium leading-snug text-slate-800">
        {item.title}
      </div>
      <div className="mt-1.5 text-[11px] leading-relaxed text-emerald-700">
        {item.result}
      </div>
      <div className="mt-1 text-[10.5px] leading-relaxed text-slate-500">
        相似点：{item.similarity}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
        <span className="truncate">{item.court}</span>
        <span className="shrink-0 text-brand">{kind.link} ↗</span>
      </div>
    </a>
  );
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
      <div className="text-[13px] font-medium text-slate-700">{title}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{children}</p>
    </div>
  );
}

export function RelatedPanel({
  laws,
  onAsk,
  onClose,
  hasAsked,
  inDomain,
  topic,
  question,
  relatedCases,
}: {
  laws: RelatedLaw[];
  onAsk: (q: string) => void;
  onClose: () => void;
  /** 是否已经提问过：决定页签与「常见争议」是否出现 */
  hasAsked: boolean;
  /** 领域前置判定结果；false 时法规与类案都必须是 0 */
  inDomain: boolean;
  topic: string;
  question: string;
  /** 本次问题闭集匹配到的相关类案（领域外为空） */
  relatedCases: JudgmentCase[];
}) {
  const [tab, setTab] = useState<Tab>("case");
  const [category, setCategory] = useState<string>("all");

  // 提问后只保留「法规 / 类案」；未提问时才显示「常见争议」。
  // 领域外：法规 0、类案 0，同样不显示常见争议。
  const tabs: { key: Tab; label: string; count: number }[] = hasAsked
    ? [
        { key: "law", label: "法规", count: inDomain ? laws.length : 0 },
        { key: "case", label: "类案", count: inDomain ? relatedCases.length : 0 },
      ]
    : [
        { key: "law", label: "法规", count: 0 },
        { key: "dispute", label: "常见争议", count: COMMON_DISPUTES.length },
        { key: "case", label: "类案", count: JUDGMENT_CASES.length },
      ];

  // 每次新问题 / 领域状态变化时给一个合理默认页签。
  // 用布尔量 laws.length > 0 参与 key，避免流式过程中逐条命中法条时反复把用户
  // 手动切走的页签拉回「法规」。
  const autoKey = `${question}|${hasAsked}|${inDomain}|${laws.length > 0}`;
  useEffect(() => {
    if (!hasAsked) {
      setTab("case");       // 首屏铺全量类案，常见争议仍可切换
    } else if (!inDomain) {
      setTab("law");        // 法规 0 的空态，明确说明领域外无资料
    } else {
      setTab(laws.length > 0 ? "law" : "case");
    }
    setCategory("all");
  }, [autoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 页签状态变化时若当前 tab 已不存在（例如从提问态回到首屏），兜底校正
  const tabKeys = tabs.map((t) => t.key).join(",");
  useEffect(() => {
    if (!tabKeys.split(",").includes(tab)) setTab(tabKeys.split(",")[0] as Tab);
  }, [tabKeys, tab]);

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

      {/* 领域外：明确告知本栏不含任何资料，避免用户以为漏加载 */}
      {hasAsked && !inDomain && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[10.5px] leading-relaxed text-amber-800">
          本问题不属于劳动关系领域{topic ? `（${topic}）` : ""}，
          本次不检索法条、不生成类案，因此相关资料为 0。
        </div>
      )}

      {/* 相关类案标题：仅提问后且领域内显示 */}
      {hasAsked && inDomain && tab === "case" && relatedCases.length > 0 && (
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
              类案参考
            </span>
            <span className="text-[11.5px] font-semibold text-slate-800">
              和你情况相似的真实判例
            </span>
          </div>
          <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
            按本次问题闭集匹配，不参与模型生成；点击卡片可打开原始出处核验。
          </div>
        </div>
      )}

      {/* 分类筛选只在「未提问 + 全量类案」时出现 */}
      {!hasAsked && tab === "case" && JUDGMENT_CASES.length > 0 && (
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
        {tab === "law" && (
          !inDomain && hasAsked ? (
            <EmptyState title="法规 0">
              本次问题不属于劳动关系领域，未检索任何法条。本栏不会列出与问题无关的劳动法条文。
            </EmptyState>
          ) : laws.length ? (
            laws.map((l, i) => <LawCard key={`${l.law}-${l.article}-${i}`} item={l} index={i + 1} />)
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-[11px] leading-relaxed text-slate-500">
              {hasAsked
                ? "本次提问尚未检索法条。提问后，Agent 实际命中的条文会逐条列在这里，供你点开核对原文。"
                : "提问后，Agent 实际命中的条文会逐条列在这里，供你点开核对原文。"}
            </div>
          )
        )}

        {tab === "dispute" && !hasAsked && (
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

        {tab === "case" && (
          hasAsked ? (
            !inDomain ? (
              <EmptyState title="类案 0">
                本次问题不属于劳动关系领域，没有相似类案。为避免误导，本栏不展示与问题无关的劳动法判例。
              </EmptyState>
            ) : relatedCases.length ? (
              relatedCases.map((c) => <RelatedCaseCard key={c.id} item={c} />)
            ) : (
              <EmptyState title="本次未匹配到相似类案">
                类案按问题关键词在 32 条真实案例闭集内匹配，不做模糊生成。
                没有命中时如实留空，不用模型编造案例。
              </EmptyState>
            )
          ) : (
            visibleCases.map((c) => <CaseCard key={c.id} item={c} />)
          )
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 px-4 py-2 text-[10px] text-slate-400">
        {hasAsked
          ? "资料随本次问题更新，仅作辅助参考，不构成法律意见"
          : "资料仅作辅助参考，不构成法律意见"}
      </div>
    </aside>
  );
}
