"use client";

import { useState } from "react";
import { reviewText, type ReviewReport, type ReviewItem } from "@/lib/api";

const LEVEL_STYLE: Record<string, string> = {
  高: "bg-red-50 border-red-200 text-red-700",
  中: "bg-amber-50 border-amber-200 text-amber-700",
  低: "bg-yellow-50 border-yellow-200 text-yellow-700",
  无: "bg-green-50 border-green-200 text-green-700",
  未知: "bg-slate-50 border-slate-200 text-slate-600",
};

const LEVEL_DOT: Record<string, string> = {
  高: "🔴",
  中: "🟠",
  低: "🟡",
  无: "🟢",
  未知: "⚪",
};

export default function ReviewPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<ReviewReport | null>(null);

  async function run() {
    if (text.trim().length < 30) return;
    setLoading(true);
    setReport(null);
    setProgress("正在切分条款…");
    try {
      const timer = setInterval(() => {
        setProgress((p) => {
          if (p.includes("切分")) return "正在检索法条并逐条审查（约30-90秒）…";
          if (p.includes("检索")) return "正在汇总风险清单…";
          return p;
        });
      }, 3000);
      const r = await reviewText(text);
      clearInterval(timer);
      setReport(r);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  async function uploadFile(file: File) {
    setLoading(true);
    setProgress(`正在上传并解析 ${file.name}…`);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p.includes("上传")) return "正在检索法条并逐条审查（约30-90秒）…";
        if (p.includes("检索")) return "正在汇总风险清单…";
        return p;
      });
    }, 3000);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("http://localhost:8000/api/review", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) throw new Error((await r.json()).detail || "审查失败");
      setReport(await r.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      clearInterval(timer);
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">📄 劳动合同风险审查</h1>
      <p className="mt-1 text-sm text-slate-500">
        上传合同文件（PDF/txt）或粘贴正文，AI 逐条识别试用期超期、放弃社保、无补偿竞业限制等风险。
      </p>

      {loading && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand px-4 py-3 text-white">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span className="text-sm">{progress || "AI 正在逐条审查，约需30-90秒…"}</span>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-slate-700">上传合同文件</label>
          <input
            type="file"
            accept=".txt,.pdf"
            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
            className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white file:cursor-pointer"
          />
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            或粘贴正文
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder={"第一条 本合同为固定期限劳动合同，期限自2024年1月1日至2027年12月31日。\n第二条 试用期6个月，试用期工资2000元。\n..."}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm"
          />
          <button
            onClick={run}
            disabled={loading || text.trim().length < 30}
            className="mt-3 w-full rounded-lg bg-brand py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "审查中…" : "开始审查"}
          </button>
          {progress && (
            <div className="mt-2 text-center text-xs text-slate-500 animate-pulse">
              {progress}
            </div>
          )}
        </div>

        <div>
          {!report && !loading && (
            <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
              审查结果会显示在这里
            </div>
          )}
          {loading && (
            <div className="flex h-64 items-center justify-center rounded-2xl bg-white text-sm text-slate-500">
              <div className="text-center">
                <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                <div>{progress || "AI 正在逐条审查…"}</div>
              </div>
            </div>
          )}
          {report && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <Stat label="条款" value={report.summary.clauses} />
                <Stat label="🔴 高风险" value={report.summary.high} danger />
                <Stat label="🟠 中风险" value={report.summary.mid} warn />
                <Stat label="🟡 低风险" value={report.summary.low} />
              </div>
              {report.items
                .filter((it) => it.risk_level !== "无")
                .map((it, i) => (
                  <RiskCard key={i} item={it} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
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
}

function RiskCard({ item }: { item: ReviewItem }) {
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
              《{b.law}》{b.article} {b.exists ? "✅" : "⚠️"}
              {b.quote && <span className="ml-1 opacity-70">— {b.quote}</span>}
            </div>
          ))}
        </div>
      )}
      {item.insufficient_basis && (
        <div className="mt-2 text-xs">⚠️ 候选法条中未找到直接依据，已如实标注</div>
      )}
    </div>
  );
}
