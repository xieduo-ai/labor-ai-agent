"use client";

import { useMemo, useState } from "react";
import { API_BASE, errMessage } from "@/lib/api";

type Scenario = string;

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
  breakdown: { label: string; value: string; law: string }[];
}

interface Scn {
  v: Scenario;
  label: string;
  /** 是否需要工作年限输入 */
  needYears?: boolean;
  /** 是否需要「未提前30天通知」代通知金开关 */
  advance?: boolean;
  /** 专项类额外输入：未签月数 / 未休天数 / 三种加班小时 / 伤残等级 */
  special?: "unsigned_months" | "leave_days" | "overtime" | "grade";
}

const GROUPS: { group: string; items: Scn[] }[] = [
  {
    group: "解除 / 终止类（走 N / 2N / +1 引擎）",
    items: [
      { v: "illegal", label: "违法解除 / 终止（无理由、末位淘汰、孕期辞退等）", needYears: true },
      { v: "maternity", label: "女职工孕期 / 产期 / 哺乳期被违法解除", needYears: true },
      { v: "negotiate", label: "协商一致解除（单位提出）", needYears: true },
      { v: "layoff", label: "经济性裁员", needYears: true },
      { v: "incompetent", label: "不能胜任工作，经培训 / 调岗仍不能胜任", needYears: true, advance: true },
      { v: "objective", label: "客观情况重大变化，合同无法履行", needYears: true, advance: true },
      { v: "probation_fail", label: "试用期不符合录用条件，单位依法解除（无补偿）", needYears: true },
      { v: "serious_violation", label: "严重违纪 / 严重失职，单位依法解除（无补偿）", needYears: true },
    ],
  },
  {
    group: "专项索赔类（独立计算口径）",
    items: [
      { v: "double_wage", label: "未签书面劳动合同二倍工资", special: "unsigned_months" },
      { v: "annual_leave", label: "应休未休年休假工资折算", special: "leave_days" },
      { v: "overtime", label: "加班费追索（延时 / 休息日 / 法定节假日）", special: "overtime" },
      { v: "work_injury", label: "工伤一次性伤残补助金（需伤残等级）", special: "grade" },
    ],
  },
];

const ALL: Scn[] = GROUPS.flatMap((g) => g.items);
const byV = (v: Scenario) => ALL.find((s) => s.v === v)!;

export default function Calculator() {
  const [salary, setSalary] = useState("");
  const [years, setYears] = useState("");
  const [reason, setReason] = useState<Scenario>("illegal");
  const [advance, setAdvance] = useState(false);
  const [unsignedMonths, setUnsignedMonths] = useState("");
  const [leaveDays, setLeaveDays] = useState("");
  const [hrsNormal, setHrsNormal] = useState("");
  const [hrsRest, setHrsRest] = useState("");
  const [hrsLegal, setHrsLegal] = useState("");
  const [grade, setGrade] = useState("10");
  // 当地社平工资可选：填了才按三倍封顶，不填按实发工资算并提示
  const [avgWage, setAvgWage] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const cur = useMemo(() => byV(reason), [reason]);

  async function calc() {
    setError("");
    const s = parseFloat(salary);
    if (!s) {
      setError("请填写月薪");
      return;
    }
    if (cur.needYears) {
      const y = parseFloat(years);
      if (Number.isNaN(y)) {
        setError("解除 / 终止类请填写工作年限");
        return;
      }
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/calc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_wage: s,
          work_years: cur.needYears ? parseFloat(years) : 0,
          scenario: reason,
          local_avg_wage: avgWage ? parseFloat(avgWage) : null,
          advance_notice: cur.advance ? advance : false,
          unsigned_months: unsignedMonths ? parseFloat(unsignedMonths) : 11,
          leave_days: leaveDays ? parseFloat(leaveDays) : 0,
          hrs_normal: hrsNormal ? parseFloat(hrsNormal) : 0,
          hrs_rest: hrsRest ? parseFloat(hrsRest) : 0,
          hrs_legal: hrsLegal ? parseFloat(hrsLegal) : 0,
          injury_grade: grade ? parseInt(grade, 10) : 10,
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
        覆盖 11 类高频解除 / 终止与专项索赔情形。规则依据《劳动合同法》第 40、46、47、82、87 条等，
        由确定性引擎计算，不靠模型心算。
      </p>

      <div className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        {/* 情形选择：分组单选 */}
        <div>
          <label className="text-sm font-medium text-slate-700">解除 / 索赔情形</label>
          <div className="mt-2 space-y-3">
            {GROUPS.map((g) => (
              <div key={g.group}>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {g.group}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {g.items.map((it) => (
                    <label
                      key={it.v}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
                        reason === it.v
                          ? "border-brand bg-brand/5 text-slate-900"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reason"
                        checked={reason === it.v}
                        onChange={() => setReason(it.v)}
                        className="accent-brand"
                      />
                      {it.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 动态输入 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              本人工资 / 月薪（元）
            </label>
            <input
              type="number"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="例如 8000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
            />
          </div>

          {cur.needYears && (
            <div>
              <label className="text-sm font-medium text-slate-700">
                工作年限（年，可小数如 3.5）
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
          )}

          {cur.special === "unsigned_months" && (
            <div>
              <label className="text-sm font-medium text-slate-700">未签合同月数（封顶 11）</label>
              <input
                type="number"
                value={unsignedMonths}
                onChange={(e) => setUnsignedMonths(e.target.value)}
                placeholder="例如 5"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
              />
            </div>
          )}

          {cur.special === "leave_days" && (
            <div>
              <label className="text-sm font-medium text-slate-700">未休年假天数</label>
              <input
                type="number"
                value={leaveDays}
                onChange={(e) => setLeaveDays(e.target.value)}
                placeholder="例如 10"
                className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2"
              />
            </div>
          )}

          {cur.special === "overtime" && (
            <>
              <div>
                <label className="text-sm font-medium text-slate-700">延时加班（小时 / 月）</label>
                <input type="number" value={hrsNormal} onChange={(e) => setHrsNormal(e.target.value)} placeholder="例如 20" className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">休息日加班（小时 / 月）</label>
                <input type="number" value={hrsRest} onChange={(e) => setHrsRest(e.target.value)} placeholder="例如 16" className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">法定节假日加班（小时 / 月）</label>
                <input type="number" value={hrsLegal} onChange={(e) => setHrsLegal(e.target.value)} placeholder="例如 3" className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2" />
              </div>
            </>
          )}

          {cur.special === "grade" && (
            <div>
              <label className="text-sm font-medium text-slate-700">伤残等级（1~10 级）</label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2">
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((g) => (
                  <option key={g} value={g}>{g} 级（补助金 {[27,25,23,21,18,16,13,11,9,7][g-1]} 个月本人工资）</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {cur.advance && (
          <label className="flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} className="accent-brand" />
            单位未提前 30 日书面通知（加付 1 个月代通知金，即 N+1）
          </label>
        )}

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

      {/* 结果区：计算明细表 */}
      {result && (
        <div className="mt-6 rounded-2xl bg-worker p-6 text-white">
          <div className="text-sm opacity-90">{result.label}</div>
          <div className="mt-2 text-4xl font-bold">
            ¥ {result.amount.toLocaleString()}
          </div>
          {result.capped && (
            <div className="mt-2 inline-block rounded bg-white/15 px-2 py-0.5 text-xs">
              已按社平三倍封顶 / 年限按 12 年计
            </div>
          )}
          <div className="mt-4 overflow-hidden rounded-xl bg-white/10">
            <table className="w-full text-left text-[12.5px]">
              <tbody>
                {result.breakdown.map((b, i) => (
                  <tr key={i} className="border-b border-white/10 last:border-0">
                    <td className="px-3 py-2 align-top text-white/85">{b.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{b.value}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-white/55">{b.law}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed opacity-80">{result.note}</p>
        </div>
      )}

      {/* 未计算时的口径说明 + 示例算例，避免页面空荡 */}
      {!result && !loading && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-[12.5px] leading-relaxed text-slate-500">
          <div className="font-medium text-slate-600">计算口径说明</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>经济补偿 N：每满 1 年算 1 个月；6 个月以上不满 1 年按 1 年；不满 6 个月算半个月。</li>
            <li>违法解除 / 终止按 <strong>2N</strong> 赔偿；未提前 30 日通知的解除加付 1 个月工资（代通知金）。</li>
            <li>月薪高于当地社平工资三倍的，按三倍封顶、年限最高 12 年。</li>
          </ul>
          <div className="mt-3 rounded-lg bg-white p-3 text-slate-600">
            <span className="font-medium text-slate-700">示例：</span>
            干 3 年、月薪 8000 被违法辞退 → N=3，2N = 3 × 8000 × 2 = <strong>¥48,000</strong>。
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-400">
        计算结果仅供参考，具体以劳动仲裁机构 / 法院认定为准 · 不影响「不构成法律意见」边界
      </p>
    </div>
  );
}
