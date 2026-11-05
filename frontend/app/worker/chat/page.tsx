"use client";

import { useState } from "react";
import { askQA, type QASource } from "@/lib/api";

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
      const res = await fetch("http://localhost:8000/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `出错了：${e.message}` },
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
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="mb-1 text-xs font-medium text-slate-500">
                    📚 引用法条（{m.sources.length} 条）
                  </div>
                  {m.sources.map((s, j) => (
                    <div key={j} className="mt-1 text-xs text-slate-600">
                      <span className="font-medium text-brand">
                        《{s.law_name}》{s.article_no}
                      </span>
                      {s.text && (
                        <span className="ml-1 text-slate-400">— {s.text.slice(0, 60)}…</span>
                      )}
                    </div>
                  ))}
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
      <div className="flex gap-2 border-t border-slate-200 pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="例：公司让我周末加班但不给加班费，合法吗？"
          className="flex-1 rounded-full border border-slate-300 px-5 py-3 text-sm focus:border-worker focus:outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={loading}
          className="rounded-full bg-worker px-6 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}
