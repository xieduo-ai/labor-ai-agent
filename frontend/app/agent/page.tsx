"use client";

import { useState } from "react";
import { API_BASE, errMessage } from "@/lib/api";

interface Step {
  step: string;
  detail: string;
}

interface AgentResp {
  steps: Step[];
  tool: string;
  reply: string;
  result: any;
}

const EXAMPLES = [
  "帮我看看这份合同有没有坑",
  "公司让我周末加班不给钱合法吗",
  "被辞退了我能拿多少钱",
];

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [contract, setContract] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [reply, setReply] = useState("");
  const [finalResult, setFinalResult] = useState<any>(null);
  const [tool, setTool] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(msg: string) {
    setLoading(true);
    setSteps([]);
    setReply("");
    setFinalResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, contract_text: contract }),
      });
      const data: AgentResp = await r.json();
      setSteps(data.steps); // 思考链由后端真实返回，不做人为延迟
      setReply(data.reply);
      setTool(data.tool);
      setFinalResult(data.result);
    } catch (e) {
      setReply(`出错了：${errMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">🤖 智能助手</h1>
      <p className="mt-1 text-sm text-slate-500">
        用一句话描述你的需求，我会自动判断该帮你查法条、审合同还是算赔偿。
      </p>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-slate-700">你的需求</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="例：帮我看看这份劳动合同有没有风险"
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <label className="mt-3 block text-sm font-medium text-slate-700">
          合同正文（可选，要说"帮我审合同"时贴这里）
        </label>
        <textarea
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          rows={4}
          placeholder="第一条 本合同期限三年，试用期6个月…"
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm"
        />
        <button
          onClick={() => run(input)}
          disabled={loading || !input.trim()}
          className="mt-3 w-full rounded-lg bg-brand py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "思考中…" : "开始"}
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

      {/* 思考链 */}
      {steps.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-medium text-slate-700">Agent 思考过程</div>
          <div className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs text-white">
                  {i + 1}
                </div>
                <div>
                  <div className="font-medium">{s.step}</div>
                  <div className="text-slate-500">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reply && (
        <div className="mt-4 rounded-xl bg-brand/5 p-4 text-sm">{reply}</div>
      )}

      {/* 问答结果 */}
      {finalResult && tool === "qa" && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="whitespace-pre-wrap text-sm">{finalResult.answer}</div>
          {finalResult.sources?.length > 0 && (
            <div className="mt-3 border-t pt-2 text-xs text-slate-500">
              📚 引用法条：
              {finalResult.sources.map((s: any, i: number) => (
                <div key={i}>《{s.law_name}》{s.article_no}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 审查结果摘要 */}
      {finalResult && tool === "review" && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{finalResult.summary.clauses}</div>
              <div className="text-xs text-slate-500">条款</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{finalResult.summary.high}</div>
              <div className="text-xs text-slate-500">高风险</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{finalResult.summary.mid}</div>
              <div className="text-xs text-slate-500">中风险</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{finalResult.summary.low}</div>
              <div className="text-xs text-slate-500">低风险</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
