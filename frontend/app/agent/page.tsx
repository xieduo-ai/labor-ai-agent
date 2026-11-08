"use client";

import { useRef, useState } from "react";
import { errMessage, streamAgent, type AgentStreamEvent } from "@/lib/api";

/** 一次工具调用 + 它的结果，合成时间线上的一张卡 */
interface ToolStep {
  tool: string;
  label: string;
  args?: Record<string, unknown>;
  detail?: string;
  result?: Record<string, unknown>;
  status: "running" | "done";
}

const EXAMPLES = [
  "我在公司干了3年，月薪8000，昨天突然被辞退，能拿多少钱？",
  "公司让我周末加班不给加班费，合法吗？",
  "试用期最长可以约定多久？",
];

/** 把工具入参渲染成人话，让用户看得懂 Agent 拿什么去调了工具 */
function argsText(tool: string, args?: Record<string, unknown>): string {
  if (!args) return "";
  if (tool === "search_law") return `检索「${args.query}」`;
  if (tool === "calc_compensation") {
    const map: Record<string, string> = {
      illegal: "违法解除",
      normal: "协商/裁员",
      no_fault: "未提前30天通知",
      expire: "合同到期不续签",
    };
    const s = map[String(args.scenario)] ?? String(args.scenario ?? "");
    return `月薪 ${args.monthly_wage} 元 · 工龄 ${args.work_years} 年 · ${s}`;
  }
  if (tool === "review_contract") {
    const t = String(args.contract_text ?? "");
    return `合同 ${t.length} 字`;
  }
  if (tool === "draft_arbitration_letter") return "按当事人陈述起草";
  return Object.entries(args)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" · ");
}

/** 工具返回值的可视化：法条原文、金额公式、文书草稿都要能看见。
 *  事实核对警告不在这里渲染——它需要常驻可见，由上层直接展示。 */
function ResultDetail({ step }: { step: ToolStep }) {
  const r = step.result;
  if (!r) return null;

  function body(r: Record<string, unknown>) {
    if (step.tool === "search_law") {
      const arts = (r.articles as Array<{ law: string; article: string; text: string }>) ?? [];
      return (
        <div className="space-y-2">
          {arts.map((a, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-xs font-medium text-slate-700">
                《{a.law}》{a.article}
              </div>
              <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-500">
                {a.text}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (step.tool === "calc_compensation") {
      return (
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-lg font-bold text-slate-900">
            ¥ {Number(r.amount ?? 0).toLocaleString()}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-600">{String(r.formula ?? "")}</div>
          <div className="mt-1 text-[11px] text-slate-500">{String(r.note ?? "")}</div>
        </div>
      );
    }

    if (step.tool === "review_contract") {
      const high = (r.high_risk as Array<{ clause_label: string; issue: string }>) ?? [];
      if (!high.length) return <div className="text-xs text-slate-500">未发现高风险条款</div>;
      return (
        <div className="space-y-1.5">
          {high.map((h, i) => (
            <div key={i} className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
              {h.clause_label}：{h.issue}
            </div>
          ))}
        </div>
      );
    }

    if (step.tool === "draft_arbitration_letter") {
      return (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
          {String(r.document ?? "")}
        </pre>
      );
    }

    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {body(r)}
    </div>
  );
}

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rounds, setRounds] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(msg: string) {
    if (!msg.trim()) return;
    setLoading(true);
    setSteps([]);
    setAnswer("");
    setError("");
    setRounds(0);
    setExpanded(null);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await streamAgent({ message: msg }, (ev: AgentStreamEvent) => {
        switch (ev.event) {
          case "step":
            if (ev.kind === "tool_call") {
              setSteps((prev) => [
                ...prev,
                { tool: ev.tool, label: ev.label, args: ev.args, status: "running" },
              ]);
            } else {
              // 结果回来，更新对应的那条（同一工具可能被调多次，取最后一个 running 的）
              setSteps((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].tool === ev.tool && next[i].status === "running") {
                    next[i] = { ...next[i], detail: ev.detail, result: ev.result, status: "done" };
                    break;
                  }
                }
                return next;
              });
            }
            break;
          case "token":
            setAnswer((prev) => prev + ev.text);
            break;
          case "done":
            setRounds(ev.rounds);
            break;
          case "error":
            setError(ev.message);
            break;
        }
      }, ac.signal);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">🤖 智能助手</h1>
      <p className="mt-1 text-sm text-slate-500">
        说出你的情况，Agent 会自己决定查哪条法条、要不要算金额，并把每一步摊开给你看。
      </p>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="例：我在公司干了3年，月薪8000，昨天突然被辞退，能拿多少钱？"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <button
          onClick={() => run(input)}
          disabled={loading || !input.trim()}
          className="mt-3 w-full rounded-lg bg-brand py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Agent 正在工作…" : "开始"}
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => setInput(e)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-brand"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* 工具调用时间线：入参和结果全部亮出来，证明是真调用 */}
      {steps.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            Agent 执行过程
            {rounds > 0 && (
              <span className="ml-auto text-xs font-normal text-slate-400">
                {rounds} 轮决策 · {steps.length} 次工具调用
              </span>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      s.status === "done"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-brand/10 text-brand"
                    }`}
                  >
                    {s.status === "done" ? "✓" : "…"}
                  </div>
                  {i < steps.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-200" />}
                </div>

                <div className="flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-800">{s.label}</span>
                    <code className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
                      {s.tool}
                    </code>
                    {s.result && (
                      <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="ml-auto text-[11px] text-brand hover:underline"
                      >
                        {expanded === i ? "收起" : "查看详情"}
                      </button>
                    )}
                  </div>

                  {s.args && (
                    <div className="mt-1 text-xs text-slate-500">
                      入参：{argsText(s.tool, s.args)}
                    </div>
                  )}

                  {s.detail && (
                    <div
                      className={`mt-1.5 rounded-lg px-3 py-2 text-xs ${
                        s.status === "done"
                          ? "bg-emerald-50/60 text-emerald-800"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {s.detail}
                    </div>
                  )}

                  {/* 事实核对警告始终显示，不折叠——它是需要用户立刻看见的风险 */}
                  {s.result && (s.result.fact_warnings as string[] | undefined)?.length ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                      <div className="text-xs font-medium text-amber-800">
                        事实核对：以下内容你的原话里没有提到
                      </div>
                      <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
                        {(s.result.fact_warnings as string[]).map((w, k) => (
                          <li key={k}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {expanded === i && <ResultDetail step={s} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 最终回答：逐字流式输出 */}
      {(answer || loading) && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-medium text-slate-700">回答</div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {answer}
            {loading && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-middle" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
