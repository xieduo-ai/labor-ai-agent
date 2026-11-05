"use client";

import { useState } from "react";

type Reason = "illegal" | "normal" | "no_fault" | "expire";

export default function Calculator() {
  const [salary, setSalary] = useState("");
  const [years, setYears] = useState("");
  const [reason, setReason] = useState<Reason>("illegal");
  const [result, setResult] = useState<{
    n: number;
    pay: number;
    label: string;
    note: string;
  } | null>(null);

  function calc() {
    const s = parseFloat(salary);
    const y = parseFloat(years);
    if (!s || !y) return;
    // N：满一年给一个月，半年以上按一年，不满半年给半个月
    let n = Math.floor(y);
    if (y - n >= 0.5) n += 1;
    else if (y - n > 0 && y - n < 0.5 && n === 0) n = 0.5;
    else if (y - n > 0 && y - n < 0.5) n += 0.5;

    let pay = 0;
    let label = "";
    let note = "";
    if (reason === "illegal") {
      // 违法解除 = 2N
      pay = n * s * 2;
      label = "违法解除劳动合同赔偿金（2N）";
      note = "用人单位违法解除/终止劳动合同，按经济补偿标准的二倍支付。";
    } else if (reason === "normal") {
      // 协商/合法裁员 = N
      pay = n * s;
      label = "经济补偿金（N）";
      note = "协商一致解除、经济性裁员、客观情况重大变化等情形。";
    } else if (reason === "no_fault") {
      // 未提前30天 = N+1
      pay = n * s + s;
      label = "代通知金 + 经济补偿金（N+1）";
      note = "医疗期满、不能胜任、客观情况变化且未提前 30 天通知。";
    } else {
      pay = n * s;
      label = "合同到期不续签经济补偿（N）";
      note = "合同到期单位不续签，或降低条件导致不续签。";
    }
    setResult({ n, pay, label, note });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">🧮 赔偿金计算器</h1>
      <p className="mt-1 text-sm text-slate-500">
        输入月薪和工龄，一键算出你应得的经济补偿/赔偿金。数字仅供参考，具体以仲裁为准。
      </p>

      <div className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <label className="text-sm font-medium text-slate-700">离职前 12 个月平均月薪（元）</label>
          <input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            placeholder="例如 8000"
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">在本单位工作年限（年）</label>
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
            {(
              [
                ["illegal", "公司违法辞退我（如末位淘汰、无理由开人）"],
                ["normal", "合法裁员/协商一致解除"],
                ["no_fault", "医疗期满/不能胜任，公司没提前30天通知"],
                ["expire", "合同到期公司不续签"],
              ] as [Reason, string][]
            ).map(([v, label]) => (
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
        <button
          onClick={calc}
          className="w-full rounded-lg bg-worker py-3 font-medium text-white hover:opacity-90"
        >
          计算
        </button>
      </div>

      {result && (
        <div className="mt-6 rounded-2xl bg-worker p-6 text-white">
          <div className="text-sm opacity-90">{result.label}</div>
          <div className="mt-2 text-4xl font-bold">¥ {result.pay.toLocaleString()}</div>
          <div className="mt-4 text-sm opacity-90">
            N = {result.n} 个月工资 · {result.n} × {salary} 元
          </div>
          <p className="mt-4 text-xs opacity-80">{result.note}</p>
        </div>
      )}
    </div>
  );
}
