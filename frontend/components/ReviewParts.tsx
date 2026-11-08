"use client";

import { memo } from "react";
import type { ReviewItem, ReviewSummary } from "@/lib/api";

export const LEVEL_STYLE: Record<string, string> = {
  高: "bg-red-50 border-red-200 text-red-700",
  中: "bg-amber-50 border-amber-200 text-amber-700",
  低: "bg-yellow-50 border-yellow-200 text-yellow-700",
  无: "bg-green-50 border-green-200 text-green-700",
  未知: "bg-slate-50 border-slate-200 text-slate-600",
};

export const LEVEL_DOT: Record<string, string> = {
  高: "🔴",
  中: "🟠",
  低: "🟡",
  无: "🟢",
  未知: "⚪",
};

/** 后端零引用时返回 null，必须显示「—」而不是伪造 100% */
export function rate(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export const Stat = memo(function Stat({
  label,
  value,
  danger,
  warn,
}: {
  label: string;
  value: number;
  danger?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <div
        className={`text-2xl font-bold ${
          danger ? "text-red-600" : warn ? "text-amber-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
});

/**
 * 风险卡。流式审查每到达一条就往数组里追加一条，如果卡片不是 memo，
 * 每次 setState 都会让前面所有卡片跟着重渲染 —— 用 memo 把渲染开销限制在新增的一张。
 */
export const RiskCard = memo(function RiskCard({ item }: { item: ReviewItem }) {
  return (
    <div className={`rounded-xl border p-4 ${LEVEL_STYLE[item.risk_level] || LEVEL_STYLE["未知"]}`}>
      <div className="font-medium">
        {LEVEL_DOT[item.risk_level]} {item.risk_type} · {item.clause_label}
      </div>
      <div className="mt-2 text-sm">
        <strong>问题：</strong>
        {item.issue}
      </div>
      {item.suggestion && (
        <div className="mt-1 text-sm">
          <strong>建议：</strong>
          {item.suggestion}
        </div>
      )}
      {item.legal_basis.length > 0 && (
        <div className="mt-2 border-t border-current/10 pt-2 text-xs">
          {item.legal_basis.map((b, i) => (
            <div key={i} className="mt-1">
              《{b.law}》{b.article}{" "}
              {b.exists ? (b.quote_ok ? "✅ 原文核对一致" : "⚠️ 摘录与原文不符") : "⚠️ 依据存疑"}
              {b.quote && <span className="ml-1 opacity-70">— {b.quote}</span>}
            </div>
          ))}
        </div>
      )}
      {item.insufficient_basis && (
        <div className="mt-2 text-xs leading-relaxed">
          ⚠️ 这类约定在司法实践中普遍被认定有问题，但各地裁判口径可能有差异；
          建议就当地标准再咨询人社部门或仲裁机构。
        </div>
      )}
    </div>
  );
});

/** 汇总区：统计卡 + 失败提示 + 引用可信度。手机端两列，桌面四列。 */
export function ReviewStats({
  summary,
  cleanCount,
}: {
  summary: ReviewSummary;
  cleanCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="条款" value={summary.clauses} />
        <Stat label="🔴 高风险" value={summary.high} danger />
        <Stat label="🟠 中风险" value={summary.mid} warn />
        <Stat label="🟡 低风险" value={summary.low} />
      </div>
      {/* 有条款失败时先亮出「结果不完整」，避免 0 风险被误读成「合同没问题」 */}
      {summary.failed > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
          ⚠️ 有 {summary.failed} 条审查失败，本次结果<strong>不完整</strong>，下面的风险统计仅覆盖成功的{" "}
          {summary.clauses - summary.failed} 条，不能作为「合同无风险」的结论。
        </div>
      )}
      {/* 引用可信度：closed-set 校验是本项目的核心卖点，直接亮出来 */}
      <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        引用有效率 {rate(summary.citation_valid_rate)} · 摘录逐字率{" "}
        {rate(summary.quote_match_rate)} · 另有 {cleanCount} 条条款未发现明显风险
        {summary.insufficient_basis > 0 &&
          ` · ${summary.insufficient_basis} 条已标注「依据不足」`}
      </div>
    </div>
  );
}
