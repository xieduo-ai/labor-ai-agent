"use client";

import { useState } from "react";
import { API_BASE, errMessage } from "@/lib/api";

type Scenario = "illegal" | "normal" | "no_fault" | "expire";

interface CalcResult {
  n_months: number;
  multiplier: number;
  extra_months: number;
  monthly_wage: number;
  amount: number;
  label: string;
  formula: string;
  note: string;
  capped: boolean;
}

const REASONS: [Scenario, string][] = [
  ["illegal", "公司违法辞退我（如末位淘汰、无理由开人）"],
  ["normal", "合法裁员 / 协商一致解除"],
  ["no_fault", "医疗期满 / 不能胜任，公司没提前30天通知"],
  ["expire", "合同到期公司不续签"],
];

export default function Calculator() {
  const [salary, setSalary] = useState("");
  const [years, setYears] = useState("");
  const [reason, setReason] = useState<Scenario>("illegal");
  // 当地社平工资可选：填了才按三倍封顶，不填按实发工资算并提示
  const [avgWage, setAvgWage] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function calc() {
    setError("");
    const s = parseFloat(salary);
    const y = parseFloat(years);
    if (!s || Number.isNaN(y)) {
      setError("请填写月薪和工作年限");
      return;
    }
    setLoading(true);
    try {
      // 计算规则在后端（src/compensation.py），与 Agent 的 calc_compensation 工具同一份
      const r = await fetch(`${API_BASE}/api/calc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_wage: s,
          work_years: y,
          scenario: reason,
          local_avg_wage: avgWage ? parseFloat(avgWage) : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "计算失败");
      setResult(await r.json());
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">🧮 赔偿金计算器</h1>
      <p className="mt-1 text-sm text-slate-500">
        输入月薪和工龄，算出你应得的经济补偿 / 赔偿金。依据《劳动合同法》第 47、87 条。
      </p>

      <div className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <label className="text-sm font-medium text-slate-700">
            离职前 12 个月平均月薪（元）
          </label>
          <input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="例如 8000"
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            在本单位工作年限（年，可填小数如 3.5）
          </label>
          <input
            type="number"
            step="0.5"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            placeholder="例如 3.5"
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">解除原因</label>
          <div className="mt-2 grid gap-2">
            {REASONS.map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="reason"
                  checked={reason === v}
                  onChange={() => setReason(v)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <details className="rounded-lg bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm text-slate-600">
            高薪人群可选：当地上年度职工月平均工资
          </summary>
          <input
            type="number"
            value={avgWage}
            onChange={(e) => setAvgWage(e.target.value)}
            placeholder="例如 10000（用于三倍封顶校验）"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">
            月薪高于社平三倍时按三倍计，且年限最高按 12 年算（第 47 条第 2 款）。
          </p>
        </details>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <button
          onClick={calc}
          disabled={loading}
          className="w-full rounded-lg bg-worker py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "计算中…" : "计算"}
        </button>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl bg-worker p-6 text-white">
          <div className="text-sm opacity-90">{result.label}</div>
          <div className="mt-2 text-4xl font-bold">
            ¥ {result.amount.toLocaleString()}
          </div>
          <div className="mt-3 font-mono text-sm opacity-95">{result.formula}</div>
          {result.capped && (
            <div className="mt-2 inline-block rounded bg-white/15 px-2 py-0.5 text-xs">
              已按社平三倍封顶 / 年限按 12 年计
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed opacity-80">{result.note}</p>
        </div>
      )}
    </div>
  );
}
