"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { errMessage, streamAgent, type AgentStreamEvent, type CitationAudit } from "@/lib/api";
import { AgentPlan } from "@/components/AgentPlan";
import { StructuredAnswer } from "@/components/StructuredAnswer";
import { RelatedPanel, type RelatedLaw } from "@/components/RelatedPanel";
import { COMMON_DISPUTES, JUDGMENT_CASES, type JudgmentCase } from "@/data/caseRefs";

// 语音模块含浏览器 API 探测，按需要时才下载（代码分割，不进首屏 bundle）。
const VoiceInput = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.VoiceInput),
  { ssr: false }
);
const SpeakButton = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.SpeakButton),
  { ssr: false }
);

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
  "公司不给我交社保，说折成工资发，行吗？",
  "竞业限制的补偿一般给多少？",
  "仲裁时效从哪天开始算？",
];

/** 争议类型关键词 -> 用于把用户问题闭集匹配到类案库（不靠模型，零幻觉） */
const CASE_KEYWORDS: Record<string, string[]> = {
  违法解除: ["违法解除", "辞退", "开除", "解除", "2N", "赔偿金", "炒鱿鱼", "被开"],
  经济补偿: ["经济补偿", "补偿金", "裁员", "协商解除", "不续签", "终止"],
  试用期: ["试用期"],
  放弃社保: ["社保", "放弃社保", "补缴", "不交社保"],
  加班费: ["加班", "加班费", "延时", "休息日"],
  竞业限制: ["竞业", "竞业限制"],
  二倍工资: ["二倍工资", "未签合同", "没签合同", "不签合同", "书面合同"],
  工伤: ["工伤", "工伤认定", "伤残"],
  女职工三期: ["孕期", "产期", "哺乳", "三期", "怀孕", "生育", "产假"],
};

/** 按问题关键词闭集匹配类案，最多返回 3 条；一条都不命中则不展示（右侧资料栏仍可按类浏览全部） */
function matchCases(question: string): JudgmentCase[] {
  const q = question.toLowerCase();
  const hits = JUDGMENT_CASES.filter((c) =>
    (CASE_KEYWORDS[c.category] ?? []).some((k) => q.includes(k.toLowerCase()))
  );
  return hits.slice(0, 3);
}

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
  if (tool === "review_contract") return `合同 ${String(args.contract_text ?? "").length} 字`;
  if (tool === "draft_arbitration_letter") return "按当事人陈述起草";
  return Object.entries(args).map(([k, v]) => `${k}=${String(v)}`).join(" · ");
}

/** 工具返回值的可视化：法条原文、金额公式、文书草稿都要能看见 */
function ResultDetail({ step }: { step: ToolStep }) {
  const r = step.result;
  if (!r) return null;

  if (step.tool === "search_law") {
    const arts = (r.articles as Array<{ law: string; article: string; text: string }>) ?? [];
    return (
      <div className="mt-2 space-y-2">
        {arts.map((a, i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-2.5">
            <div className="text-xs font-medium text-slate-700">《{a.law}》{a.article}</div>
            <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-500">{a.text}</div>
          </div>
        ))}
      </div>
    );
  }
  if (step.tool === "calc_compensation") {
    return (
      <div className="mt-2 rounded-lg bg-slate-50 p-3">
        <div className="text-lg font-bold text-slate-900">¥ {Number(r.amount ?? 0).toLocaleString()}</div>
        <div className="mt-1 font-mono text-xs text-slate-600">{String(r.formula ?? "")}</div>
        <div className="mt-1 text-[11px] text-slate-500">{String(r.note ?? "")}</div>
      </div>
    );
  }
  if (step.tool === "review_contract") {
    const high = (r.high_risk as Array<{ clause_label: string; issue: string }>) ?? [];
    if (!high.length) return <div className="mt-2 text-xs text-slate-500">未发现高风险条款</div>;
    return (
      <div className="mt-2 space-y-1.5">
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
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
        {String(r.document ?? "")}
      </pre>
    );
  }
  return null;
}

/** 左侧极窄图标栏：对标产品那条 rail，只放真实有功能的入口 */
function IconRail({ onNew, onTogglePanel, panelOpen }: {
  onNew: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
}) {
  return (
    <div className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-3 md:flex">
      <button onClick={onNew} title="新建对话" aria-label="新建对话"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-brand">
        <span className="text-base leading-none">＋</span>
      </button>
      <button onClick={onTogglePanel} title="相关资料" aria-label="相关资料"
        className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white ${
          panelOpen ? "bg-white text-brand" : "text-slate-500 hover:text-brand"
        }`}>
        <span className="text-base leading-none">▤</span>
      </button>
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
  const [plan, setPlan] = useState<{ goal: string; steps: string[] } | null>(null);
  const [laws, setLaws] = useState<RelatedLaw[]>([]);
  const [citationAudit, setCitationAudit] = useState<CitationAudit | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [processOpen, setProcessOpen] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const completedCount = useMemo(() => steps.filter((s) => s.status === "done").length, [steps]);
  const speakText = useMemo(() => answer.replace(/\*\*/g, ""), [answer]);
  // 回答产出后，闭集匹配类案库，给出 1~3 条「类案参考」（不靠模型，零幻觉）
  const relatedCases = useMemo(
    () => (answer && lastQuestion ? matchCases(lastQuestion) : []),
    [answer, lastQuestion]
  );

  /** 每次检索命中都累加进右侧资料栏（去重），只收真实工具返回值 */
  const collectLaws = useCallback((result?: Record<string, unknown>) => {
    const arts = (result?.articles as Array<{ law: string; article: string; text: string }>) ?? [];
    if (!arts.length) return;
    setLaws((prev) => {
      const seen = new Set(prev.map((l) => `${l.law}-${l.article}`));
      const next = [...prev];
      for (const a of arts) {
        const k = `${a.law}-${a.article}`;
        if (!seen.has(k)) {
          seen.add(k);
          next.push({ law: a.law, article: a.article, text: a.text });
        }
      }
      return next;
    });
  }, []);

  const run = useCallback(async (msg: string) => {
    if (!msg.trim()) return;
    setLoading(true);
    setSteps([]);
    setAnswer("");
    setError("");
    setRounds(0);
    setExpanded(null);
    setPlan(null);
    setLaws([]);
    setCitationAudit(null);
    setLastQuestion(msg);
    setInput(msg);
    setProcessOpen(false);

    const ac = new AbortController();
    abortRef.current = ac;

    // 规划阶段自动展开「执行过程」，让评委/用户实时看到 Agent 在做什么，
    // 避免首字延迟期间页面像「卡死」（对应教师提出的技术风险点）。答完后再收起。
    setProcessOpen(true);

    try {
      await streamAgent({ message: msg }, (ev: AgentStreamEvent) => {
        switch (ev.event) {
          case "plan":
            setPlan({ goal: ev.goal, steps: ev.steps });
            break;
          case "step":
            if (ev.kind === "tool_call") {
              setSteps((prev) => [
                ...prev,
                { tool: ev.tool, label: ev.label, args: ev.args, status: "running" },
              ]);
            } else {
              if (ev.tool === "search_law") collectLaws(ev.result);
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
            setCitationAudit(ev.citation_audit ?? null);
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
  }, [collectLaws]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setInput(""); setSteps([]); setAnswer(""); setError(""); setRounds(0);
    setExpanded(null); setPlan(null); setLaws([]); setCitationAudit(null); setLastQuestion("");
    setProcessOpen(false); setLoading(false);
  }, []);

  const askExample = useCallback((q: string) => { void run(q); }, [run]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] bg-white">
      <IconRail onNew={newChat} onTogglePanel={() => setPanelOpen(!panelOpen)} panelOpen={panelOpen} />

      {/* 主区：顶栏 + 结构化回答 + 底部输入框 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
          <button onClick={newChat} className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-brand">
            <span className="text-sm leading-none">＋</span> 新建对话
          </button>
          <span className="h-4 w-px bg-slate-200" />
          <div className="flex-1 text-center text-[13px] font-medium text-slate-800">智能对话</div>
          <span className="hidden text-[11px] text-slate-400 sm:inline">14 部法规 · 678 条原文</span>
          <button onClick={() => setPanelOpen(!panelOpen)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand hover:text-brand">
            {panelOpen ? "收起资料" : "相关资料"}
          </button>
        </div>

        {/* 内容滚动区 */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-6">
            {/* 未提问时：常见争议卡铺满首屏，页面不空 */}
            {!answer && !loading && (
              <div>
                <div className="text-[20px] font-semibold tracking-tight text-slate-900">
                  说出你的情况，我帮你查依据、算金额
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  Agent 会自主决定查哪条法条、要不要算赔偿，并把每一步摊开给你核验。
                  每条结论都限定在检索到的法条内，摘录与原文逐字比对。
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  聚焦劳动法领域；其他法律问题仅提供常识性说明，不构成法律意见
                </div>
                <div className="mt-5 text-[12px] font-medium text-slate-500">常见劳动争议</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {COMMON_DISPUTES.slice(0, 6).map((d) => (
                    <button key={d.id} onClick={() => askExample(d.question)}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-brand/40 hover:shadow-sm">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{d.category}</span>
                      <div className="mt-2 text-[12.5px] leading-snug text-slate-700">{d.question}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-[10px] leading-relaxed text-slate-400">
                  以上题目来自本项目自建 40 题口语化评测集，可用仓库脚本复现；不是裁判案例。
                </div>
              </div>
            )}

            {/* 用户问题回显 */}
            {lastQuestion && (answer || loading) && (
              <div className="mb-5 flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-[13px] leading-relaxed text-white">
                  {lastQuestion}
                </div>
              </div>
            )}

            {/* 执行过程：默认收起，点开看完整计划与工具时间线 */}
            {(plan || steps.length > 0) && (
              <div className="mb-5 rounded-xl border border-slate-200 bg-white">
                <button onClick={() => setProcessOpen(!processOpen)}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
                  <span className="text-[12px] text-slate-500">{processOpen ? "▾" : "▸"}</span>
                  <span className="text-[12px] font-medium text-slate-600">执行过程</span>
                  <span className="ml-auto text-[11px] text-slate-400">
                    {rounds > 0 ? `${rounds} 轮决策 · ` : ""}{completedCount}/{steps.length} 次工具已完成
                  </span>
                </button>

                {processOpen && (
                  <div className="border-t border-slate-100 px-3.5 py-3">
                    {plan && <AgentPlan goal={plan.goal} steps={plan.steps} />}
                    <div className="mt-3 space-y-3">
                      {steps.map((s, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                              s.status === "done" ? "bg-emerald-50 text-emerald-600" : "bg-brand/10 text-brand"
                            }`}>
                              {s.status === "done" ? "✓" : "…"}
                            </div>
                            {i < steps.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-200" />}
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-[13px] font-medium text-slate-800">{s.label}</span>
                              <code className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">{s.tool}</code>
                              {s.result && (
                                <button onClick={() => setExpanded(expanded === i ? null : i)}
                                  className="ml-auto text-[11px] text-brand hover:underline">
                                  {expanded === i ? "收起" : "查看详情"}
                                </button>
                              )}
                            </div>
                            {s.args && <div className="mt-1 text-[11px] text-slate-500">入参：{argsText(s.tool, s.args)}</div>}
                            {s.detail && (
                              <div className={`mt-1.5 rounded-lg px-3 py-2 text-[11px] ${
                                s.status === "done" ? "bg-emerald-50/60 text-emerald-800" : "bg-slate-50 text-slate-600"
                              }`}>{s.detail}</div>
                            )}
                            {s.result && (s.result.fact_warnings as string[] | undefined)?.length ? (
                              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                <div className="text-[11px] font-medium text-amber-800">事实核对：以下内容你的原话里没有提到</div>
                                <ul className="mt-1 list-inside list-disc text-[11px] text-amber-700">
                                  {(s.result.fact_warnings as string[]).map((w, k) => <li key={k}>{w}</li>)}
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
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">{error}</div>
            )}

            {/* 结构化回答 */}
            {(answer || (loading && steps.some((s) => s.status === "done"))) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="text-[12px] font-medium text-slate-500">回答</div>
                  {!loading && <SpeakButton text={speakText} />}
                </div>
                <StructuredAnswer
                  text={answer}
                  streaming={loading}
                  onLawClick={() => setPanelOpen(true)}
                  verifiedArticles={laws.map((l) => l.article)}
                />

                {/* 类案参考：闭集匹配，随回答一起给出相似判例，对标「得理法搜」的同类案例区 */}
                {!loading && relatedCases.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                        类案参考
                      </span>
                      <span className="text-[13px] font-semibold text-slate-800">
                        和你情况相似的真实判例
                      </span>
                    </div>
                    <div className="space-y-2">
                      {relatedCases.map((c) => (
                        <a
                          key={c.id}
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-white bg-white p-3 transition-colors hover:border-sky-300"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              {c.category}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {c.level} · {c.caseNo}
                            </span>
                          </div>
                          <div className="mt-1 line-clamp-1 text-[13px] font-medium text-slate-800">
                            {c.title}
                          </div>
                          <div className="mt-1 text-[11.5px] leading-relaxed text-emerald-700">
                            {c.result}
                          </div>
                          <div className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">
                            相似点：{c.similarity}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {loading && !answer && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
                      {plan ? "正在规划解决方案…" : "正在理解你的情况…"}
                    </div>
                    {plan && (
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[12px] text-slate-600">目标：{plan.goal}</div>
                        {plan.steps.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px] text-slate-500">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 space-y-2">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                )}
                {citationAudit && !loading && citationAudit.total > 0 && (
                  <div className={`mt-4 rounded-lg border p-3 text-[11px] leading-relaxed ${
                    citationAudit.unverified.length === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}>
                    <div className="font-medium">
                      引用核验 · 回答中出现 {citationAudit.total} 处条号，
                      {citationAudit.verified} 处命中本次检索
                      {citationAudit.unverified.length > 0
                        ? `，${citationAudit.total - citationAudit.verified} 处未核验`
                        : "，全部可核验"}
                    </div>
                    <div className="mt-1 text-[10.5px] opacity-80">
                      本次可用条号：{citationAudit.whitelist.join("、") || "（本次未检索法条）"}
                    </div>
                    {citationAudit.unverified.length > 0 && (
                      <div className="mt-1 text-[10.5px]">
                        未核验条号已在正文中标注 ⚠：{citationAudit.unverified.join("、")}。
                        这些条号不在本次检索结果内，请勿作为依据引用。
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-5 border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                  本回答由 AI 辅助生成，仅供学习研究，不构成法律意见
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部固定输入区 */}
        <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2.5 shadow-sm focus-within:border-brand/50">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void run(input);
                  }
                }}
                placeholder="输入需求，我会自主匹配法条、计算金额并给出依据…"
                className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-1 text-[13px] leading-relaxed outline-none placeholder:text-slate-400" />
              <VoiceInput onText={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))} disabled={loading} />
              <button onClick={() => void run(input)} disabled={loading || !input.trim()}
                aria-label="发送"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:opacity-90 disabled:opacity-40">
                <span className="text-sm leading-none">↑</span>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">Agent 工具循环</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">闭集引用</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500">逐字核验</span>
              <span className="ml-auto text-[10px] text-slate-400">Enter 发送 · Shift+Enter 换行</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLES.slice(0, 3).map((e) => (
                <button key={e} onClick={() => setInput(e)}
                  className="truncate rounded-full border border-slate-200 px-2.5 py-1 text-[10px] text-slate-500 hover:border-brand hover:text-brand">
                  {e.length > 22 ? `${e.slice(0, 22)}…` : e}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧相关资料栏 */}
      {panelOpen && (
        <div className="hidden h-[calc(100vh-3.5rem)] w-[330px] shrink-0 lg:block xl:w-[360px]">
          <RelatedPanel laws={laws} onAsk={askExample} onClose={() => setPanelOpen(false)} />
        </div>
      )}
    </div>
  );
}
