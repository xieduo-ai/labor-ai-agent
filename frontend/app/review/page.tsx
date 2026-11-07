"use client";

import { useRef, useState } from "react";
import {
  errMessage,
  streamReview,
  type ReviewItem,
  type ReviewSummary,
} from "@/lib/api";

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
  // 多模态：识别阶段状态 + 识别来源 + 图片预览
  const [stage, setStage] = useState<"idle" | "reading" | "reviewing">("idle");
  const [extract, setExtract] = useState<{ method: string; pages: number; chars: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // 流式状态：条款总数 / 已审完条数 / 增量结果 / 汇总 / 错误
  const [total, setTotal] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const riskItems = items.filter((it) => it.risk_level !== "无");
  const cleanCount = items.length - riskItems.length;

  function reset() {
    setTotal(0);
    setReviewed(0);
    setItems([]);
    setSummary(null);
    setErrors([]);
    setExtract(null);
    setStage("idle");
  }

  async function start(payload: { text: string } | FormData, path?: string) {
    setLoading(true);
    reset();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamReview(payload, (ev) => {
        switch (ev.event) {
          case "extract_start":
            setStage("reading");
            break;
          case "extract":
            setStage("reviewing");
            setExtract({ method: ev.method, pages: ev.pages, chars: ev.chars });
            // 识别结果回填到编辑框：用户可以核对、改错字后重审
            setText(ev.text);
            break;
          case "meta":
            setTotal(ev.clauses);
            break;
          case "clause":
            setItems((prev) => [...prev, ...ev.items]);
            setReviewed(ev.index);
            break;
          case "done":
            setSummary(ev.summary);
            break;
          case "error":
            setErrors((prev) => [...prev, ev.message]);
            break;
        }
      }, ac.signal, path);
    } catch (e) {
      setErrors((prev) => [...prev, errMessage(e)]);
    } finally {
      setLoading(false);
      setStage("idle");
      abortRef.current = null;
    }
  }

  async function run() {
    if (text.trim().length < 30) return;
    await start({ text });
  }

  /** 按文件类型选通道：图片走多模态识别，PDF/txt 走文本抽取 */
  async function uploadFile(file: File) {
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
    if (isImage) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
    const fd = new FormData();
    fd.append("file", file);
    await start(fd, isImage ? "/api/review_image" : "/api/review");
  }

  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  // 没有引用时后端返回 null，显示「—」而不是伪造 100%
  const rate = (v: number | null) =>
    v == null ? "—" : `${(v * 100).toFixed(1)}%`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">📄 劳动合同风险审查</h1>
      <p className="mt-1 text-sm text-slate-500">
        上传合同文件、<strong>直接拍合同照片</strong>，或粘贴正文。AI 逐条识别试用期超期、放弃社保、无补偿竞业限制等风险，
        每条结论都附可核验的法条原文。审查过程实时流式返回，每审完一条立即显示。
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">上传合同文件</label>
              <input
                type="file"
                accept=".txt,.pdf"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-white file:cursor-pointer"
              />
              <div className="mt-1 text-[11px] text-slate-400">PDF / txt（有文字层，1-2 秒）</div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">拍合同照片</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={loading}
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white file:cursor-pointer"
              />
              <div className="mt-1 text-[11px] text-slate-400">手机相册/直接拍照（视觉模型识别）</div>
            </div>
          </div>

          {preview && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="合同照片预览" className="h-16 w-16 rounded-lg object-cover" />
              <div className="text-xs text-slate-500">
                已选图片
                {extract && (
                  <div className="mt-1 text-green-700">
                    ✅ 识别 {extract.chars} 字（
                    {extract.method === "pdf_vision" ? `扫描件 ${extract.pages} 页` : "照片"}）
                    ，已填入下方文本框，可改错字后重审
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            或粘贴正文
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            disabled={loading}
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
        </div>

        <div>
          {/* 流式进度：识别阶段 + 逐条审查阶段 */}
          {loading && (
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                <span className="text-sm font-medium text-slate-700">
                  {stage === "reading"
                    ? "正在识别图片中的合同文字…（视觉模型）"
                    : total > 0
                      ? `正在逐条审查：${reviewed} / ${total} 条`
                      : "正在切分条款、检索法条…"}
                </span>
                <span className="ml-auto text-xs text-slate-400">{progressPct}%</span>
              </div>
              {total > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {!loading && !summary && items.length === 0 && errors.length === 0 && (
            <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
              审查结果会显示在这里
            </div>
          )}

          {/* 汇总：done 事件到达后显示 */}
          {summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
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
          )}

          {/* 风险清单：逐条到达、逐条渲染 */}
          {riskItems.length > 0 && (
            <div className={`mt-4 space-y-3 ${loading ? "opacity-95" : ""}`}>
              {riskItems.map((it, i) => (
                <RiskCard key={i} item={it} />
              ))}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {errors.map((m, i) => (
                <div key={i}>⚠️ {m}</div>
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
              《{b.law}》{b.article}{" "}
              {b.exists ? (b.quote_ok ? "✅ 原文核对一致" : "⚠️ 摘录与原文不符") : "⚠️ 依据存疑"}
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
