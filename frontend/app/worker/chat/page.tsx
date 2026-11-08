"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { askQA, errMessage, type QASource } from "@/lib/api";
import { RichText } from "@/components/RichText";
import { SourceList } from "@/components/SourceList";

// 语音按需加载，不进首屏 bundle；浏览器不支持时组件会自动隐藏
const VoiceInput = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.VoiceInput),
  { ssr: false }
);
const SpeakButton = dynamic(
  () => import("@/components/VoiceInput").then((m) => m.SpeakButton),
  { ssr: false }
);

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: QASource[];
}

const EXAMPLES = [
  "老板说试用期只给两千生活费，合法吗？",
  "公司拖欠工资三个月，能要赔偿金吗？",
  "公司不给交社保，说折成工资发，行吗？",
  "末位淘汰被辞退，能要 2N 吗？",
];

export default function WorkerChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setInput("");
    const newMsgs = [...msgs, { role: "user" as const, content: q }];
    setMsgs(newMsgs);
    setLoading(true);
      try {
        // 把之前的对话历史传给后端做上下文
        const history = newMsgs.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const data = await askQA(q, history);
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: data.answer, sources: data.sources },
        ]);
      } catch (e) {
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: `出错了：${errMessage(e)}` },
        ]);
      } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem-4rem)] max-w-3xl flex-col px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">💬 劳动法问答</h1>
        <p className="mt-1 text-sm text-slate-500">
          像跟懂法的朋友聊天一样提问。每个回答都附法条原文，不编法条。
        </p>
      </div>

      {/* 示例问题 */}
      {msgs.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
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
                m.role === "user"
                  ? "bg-worker text-white"
                  : "bg-white shadow-sm"
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                <RichText text={m.content} />
              </div>
              <SourceList sources={m.sources} />
              {m.role === "assistant" && (
                <div className="mt-2 text-right">
                  <SpeakButton text={m.content} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-sm text-slate-400">检索法条并思考中…</div>
        )}
      </div>

      {/* 输入框 */}
      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="例：公司让我周末加班但不给加班费，合法吗？"
          className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-3 text-sm focus:border-worker focus:outline-none sm:px-5"
        />
        <VoiceInput onText={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))} disabled={loading} />
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
