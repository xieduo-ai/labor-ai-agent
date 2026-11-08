"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  askQA,
  errMessage,
  streamAgent,
  type AgentStreamEvent,
  type QASource,
} from "@/lib/api";
import { RichText } from "@/components/RichText";
import { SourceList } from "@/components/SourceList";
import { AgentPlan } from "@/components/AgentPlan";

// 语音按需加载，不进首屏 bundle；浏览器不支持时组件会自动隐藏
const VoiceInput = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.VoiceInput),
  { ssr: false }
);
const SpeakButton = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.SpeakButton),
  { ssr: false }
);

type Mode = "agent" | "quick";

interface ToolTrace {
  tool: string;
  label: string;
  detail?: string;
  status: "running" | "done";
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  mode?: Mode;
  sources?: QASource[];
  plan?: { goal: string; steps: string[] };
  tools?: ToolTrace[];
  rounds?: number;
  streaming?: boolean;
  error?: string;
}

const EXAMPLES = [
  "我在公司干了3年，月薪8000，突然被辞退能拿多少钱？",
  "公司拖欠工资三个月，能要赔偿金吗？",
  "公司不给交社保，说折成工资发，行吗？",
  "试用期最长可以约定多久？",
];

/**
 * 劳动者问答页。默认走与「智能助手」完全相同的 Agent 工具循环，
 * 避免两个入口出现「一个能算金额、一个只能聊天」的割裂感。
 *
 * 保留「快速问答」模式是有意的：单条法规查询走 /api/qa 只需一次检索+一次生成，
 * 对应 82.5% Recall@5 那条评测管线，首字约 2 秒；硬套 Agent 会白多 2~3 次
 * 模型调用。所以这里是「按任务复杂度分层」，不是两套割裂的产品。
 */
export default function WorkerChat() {
  const [mode, setMode] = useState<Mode>("agent");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function patchLast(fn: (m: Msg) => Msg) {
    setMsgs((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setInput("");
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((prev) => [...prev, { role: "user" as const, content: q }]);
    setLoading(true);

    if (mode === "quick") {
      setMsgs((prev) => [
        ...prev,
        { role: "assistant", content: "", mode: "quick", streaming: true },
      ]);
      try {
        const data = await askQA(q, history);
        patchLast((m) => ({
          ...m,
          content: data.answer,
          sources: data.sources,
          streaming: false,
        }));
      } catch (e) {
        patchLast((m) => ({
          ...m,
          content: `出错了：${errMessage(e)}`,
          streaming: false,
        }));
      } finally {
        setLoading(false);
      }
      return;
    }

    // Agent 模式：与 /agent 共用 /api/agent/stream，逐事件增量渲染
    const ac = new AbortController();
    abortRef.current = ac;
    setMsgs((prev) => [
      ...prev,
      { role: "assistant" as const, content: "", mode: "agent", tools: [], streaming: true },
    ]);
    try {
      await streamAgent({ message: q, history }, (ev: AgentStreamEvent) => {
        switch (ev.event) {
          case "plan":
            patchLast((m) => ({ ...m, plan: { goal: ev.goal, steps: ev.steps } }));
            break;
          case "step":
            patchLast((m) => {
              const tools = [...(m.tools ?? [])];
              if (ev.kind === "tool_call") {
                tools.push({ tool: ev.tool, label: ev.label, status: "running" });
              } else {
                for (let i = tools.length - 1; i >= 0; i--) {
                  if (tools[i].tool === ev.tool && tools[i].status === "running") {
                    tools[i] = { ...tools[i], detail: ev.detail, status: "done" };
                    break;
                  }
                }
              }
              return { ...m, tools };
            });
            break;
          case "token":
            patchLast((m) => ({ ...m, content: m.content + ev.text }));
            break;
          case "done":
            patchLast((m) => ({ ...m, rounds: ev.rounds, streaming: false }));
            break;
          case "error":
            patchLast((m) => ({ ...m, error: ev.message, streaming: false }));
            break;
        }
      }, ac.signal);
    } catch (e) {
      patchLast((m) => ({ ...m, error: errMessage(e), streaming: false }));
    } finally {
      // 异常中断时也要收起光标，幂等
      patchLast((m) => (m.streaming ? { ...m, streaming: false } : m));
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem-4rem)] max-w-3xl flex-col px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">💬 劳动法问答</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            {mode === "agent"
              ? "与「智能助手」同一套 Agent 引擎：自主规划 → 查法条 / 算金额 / 审合同 → 逐字回答，每一步都看得见。"
              : "一次检索直接作答，更快；适合单条法规查询，回答附法条原文。"}
          </p>
        </div>
        <div className="flex shrink-0 rounded-full border border-slate-200 bg-white p-1 text-xs">
          <button
            onClick={() => setMode("agent")}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              mode === "agent" ? "bg-worker text-white" : "text-slate-500 hover:text-worker"
            }`}
          >
            深度 Agent
          </button>
          <button
            onClick={() => setMode("quick")}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              mode === "quick" ? "bg-worker text-white" : "text-slate-500 hover:text-worker"
            }`}
          >
            快速问答
          </button>
        </div>
      </div>

      {/* 示例问题 */}
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:border-worker hover:text-worker"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                m.role === "user" ? "bg-worker text-white" : "bg-white shadow-sm"
              }`}
            >
              {/* Agent 模式：执行计划 + 工具时间线，与智能助手页一致 */}
              {m.role === "assistant" && m.mode === "agent" && m.plan && (
                <AgentPlan goal={m.plan.goal} steps={m.plan.steps} />
              )}
              {m.role === "assistant" && m.tools && m.tools.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                  <div className="text-xs font-medium text-slate-500">
                    Agent 执行过程{m.rounds ? ` · ${m.rounds} 轮` : ""}
                  </div>
                  {m.tools.map((t, j) => (
                    <div key={j} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={
                          t.status === "done" ? "text-emerald-600" : "text-slate-400"
                        }
                      >
                        {t.status === "done" ? "✓" : "…"}
                      </span>
                      <span className="font-medium text-slate-700">{t.label}</span>
                      <code className="rounded bg-slate-50 px-1 text-[11px] text-slate-500">
                        {t.tool}
                      </code>
                      {t.detail && <span className="text-slate-500">· {t.detail}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed first:mt-0">
                <RichText text={m.content} />
                {m.streaming && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-worker align-middle" />
                )}
              </div>

              {m.error && (
                <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                  {m.error}
                </div>
              )}
              <SourceList sources={m.sources} />
              {m.role === "assistant" && !m.streaming && m.content && (
                <div className="mt-2 text-right">
                  <SpeakButton text={m.content} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && msgs.length === 0 && (
          <div className="text-sm text-slate-400">检索法条并思考中…</div>
        )}
      </div>

      {/* 输入框 */}
      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder={
            mode === "agent"
              ? "例：干了3年月薪8000被辞退，能赔多少？依据是什么？"
              : "例：公司让我周末加班但不给加班费，合法吗？"
          }
          className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-3 text-sm focus:border-worker focus:outline-none sm:px-5"
        />
        <VoiceInput
          onText={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading}
          className="shrink-0 rounded-full bg-worker px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:px-6"
        >
          发送
        </button>
      </div>
    </div>
  );
}
