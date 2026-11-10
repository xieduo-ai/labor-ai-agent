"""经济补偿金 / 赔偿金计算：法律规则只此一份。

为什么要单独抽出来：
原来这套规则写在前端页面的 `calc()` 里，Agent 想算金额只能回一句「请跳转计算器」——
因为规则在浏览器里，后端摸不到。现在规则搬到后端，两个入口共用：
  - 前端计算器页  -> POST /api/calc
  - Agent 工具    -> calc_compensation(...)
同一份规则只有一个实现，改法条口径时不会漏改一处。

法律依据：
  《劳动合同法》第 47 条 —— N 的计算（满一年一个月；六个月以上不满一年按一年；
                            不满六个月支付半个月）
  《劳动合同法》第 47 条第 2 款 —— 月工资高于当地上年度职工月平均工资三倍的，
                            按三倍数额支付，且年限最高不超过 12 年
  《劳动合同法》第 87 条 —— 违法解除/终止，按经济补偿标准的二倍支付（2N）
  《劳动合同法》第 40 条 —— 医疗期满、不能胜任、客观情况重大变化，未提前 30 日
                            书面通知的，额外支付一个月工资（代通知金，即 N+1）
  《劳动合同法》第 39 条 —— 严重违纪、试用期不符合录用条件，合法解除无需支付经济补偿
  《劳动合同法》第 82 条 —— 未签书面劳动合同，自用工满一月次日至满一年前，
                            每月支付二倍工资（上限 11 个月）
  《职工带薪年休假条例》第 5 条 —— 未休年假按日工资 300% 支付（含已付工资，实为额外 200%）
  《劳动法》第 44 条 —— 延时加班 150%、休息日加班 200%、法定假日加班 300%
  《工伤保险条例》第 37 条 —— 一次性伤残补助金 = 本人工资 × 对应月数（1~10 级）
"""
from dataclasses import dataclass, field
from typing import Optional


# 情形 -> 说明。前端单选、Agent 工具枚举都从这里取，避免两边文案不一致
SCENARIOS = {
    # —— 解除 / 终止类（走 N / 2N / +1 引擎）——
    "negotiate":      "协商一致解除（用人单位提出，双方同意）",
    "probation_fail": "试用期不符合录用条件，单位依法解除",
    "serious_violation": "严重违纪 / 严重失职，单位依法解除",
    "incompetent":    "不能胜任工作，经培训或调岗仍不能胜任，单位解除",
    "objective":      "客观情况发生重大变化，致使合同无法履行，单位解除",
    "layoff":         "经济性裁员",
    "illegal":        "用人单位违法解除或终止劳动合同（无理由辞退、末位淘汰、孕期辞退等）",
    "maternity":      "女职工在孕期/产期/哺乳期被违法解除",
    # —— 专项索赔类（有独立计算口径）——
    "double_wage":    "用人单位自用工起超过一个月未与劳动者订立书面劳动合同",
    "annual_leave":   "应休未休年休假工资折算",
    "overtime":       "加班费追索（延时 / 休息日 / 法定节假日）",
    "work_injury":    "工伤一次性伤残补助金（需劳动能力鉴定等级）",
}

# 工伤 1~10 级对应的一次性伤残补助金月数（《工伤保险条例》第 37 条）
INJURY_GRADE_MONTHS = [27, 25, 23, 21, 18, 16, 13, 11, 9, 7]


@dataclass
class BreakdownRow:
    label: str
    value: str
    law: str = ""

    def to_dict(self) -> dict:
        return {"label": self.label, "value": self.value, "law": self.law}


@dataclass
class Result:
    n_months: float          # 补偿月数（N），非 N 类情形为 0
    multiplier: float        # 倍数：1 = N，2 = 2N，0 = 无补偿
    extra_months: float      # 代通知金（+1）
    monthly_wage: float      # 计算基数（可能被三倍封顶）
    amount: float            # 最终金额（专项类为对应索赔额）
    label: str
    formula: str
    note: str
    capped: bool             # 是否触发三倍封顶 / 12 年年限上限
    breakdown: list = field(default_factory=list)  # 计算明细表行

    def to_dict(self) -> dict:
        return {
            "n_months": self.n_months,
            "multiplier": self.multiplier,
            "extra_months": self.extra_months,
            "monthly_wage": round(self.monthly_wage, 2),
            "amount": round(self.amount, 2),
            "label": self.label,
            "formula": self.formula,
            "note": self.note,
            "capped": self.capped,
            "breakdown": [r.to_dict() for r in self.breakdown],
        }


def calc_n(years: float) -> float:
    """工作年限 -> 补偿月数 N（第 47 条）。

    满 1 年给 1 个月；6 个月以上不满 1 年按 1 年算；不满 6 个月给半个月。
    例：3.0 -> 3；3.5 -> 4；3.4 -> 3.5；0.3 -> 0.5
    """
    if years <= 0:
        return 0.0
    whole = int(years)
    rest = round(years - whole, 4)
    if rest == 0:
        return float(whole)
    if rest >= 0.5:
        return float(whole + 1)
    # 不满半年：有整年则加 0.5，没有整年直接 0.5
    return float(whole) + 0.5 if whole > 0 else 0.5


def _fmt(x: float) -> str:
    """3.0 -> '3'，3.5 -> '3.5'，避免出现 '3.0 个月' 这种别扭写法。"""
    return str(int(x)) if float(x).is_integer() else str(x)


def _round(x: float) -> float:
    return round(x, 2)


def calc_compensation(
    monthly_wage: float,
    work_years: float = 0.0,
    scenario: str = "illegal",
    local_avg_wage: Optional[float] = None,
    advance_notice: bool = False,
    unsigned_months: float = 11.0,
    leave_days: float = 0.0,
    hrs_normal: float = 0.0,
    hrs_rest: float = 0.0,
    hrs_legal: float = 0.0,
    injury_grade: int = 10,
) -> dict:
    """计算补偿 / 赔偿金额。

    Args:
        monthly_wage: 离职前 12 个月平均应发工资（元），也是未签合同/年假/工伤的「本人工资」基数
        work_years:   在本单位工作年限（年，可含小数），仅解除/终止类使用
        scenario:     见 SCENARIOS
        local_avg_wage: 当地上年度职工月平均工资。给了才做三倍封顶判断
        advance_notice: 单位未提前 30 日书面通知（仅不能胜任/客观情况变化/医疗期满类适用，触发 +1 代通知金）
        unsigned_months: 未签书面合同月数（double_wage）
        leave_days: 未休年假天数（annual_leave）
        hrs_normal / hrs_rest / hrs_legal: 各类加班小时数（overtime，按月计）
        injury_grade: 工伤伤残等级 1~10（work_injury）
    """
    if monthly_wage <= 0:
        raise ValueError("月薪必须大于 0")
    if scenario not in SCENARIOS:
        raise ValueError(f"未知情形：{scenario}，可选 {list(SCENARIOS)}")

    # ---------------- 专项索赔类（独立口径）----------------
    if scenario == "double_wage":
        m = max(0.0, min(float(unsigned_months), 11.0))  # 第 82 条上限 11 个月
        amount = monthly_wage * m
        return Result(
            n_months=0, multiplier=0, extra_months=0, monthly_wage=monthly_wage,
            amount=amount,
            label="未签书面劳动合同二倍工资差额",
            formula=f"{_fmt(m)} 个月 × {_fmt(monthly_wage)} 元",
            note="依据《劳动合同法》第 82 条：自用工之日起超过一个月不满一年未订立书面合同，"
                 "应当向劳动者每月支付二倍的工资（上限 11 个月）。起算点为用工满一个月的次日。",
            capped=False,
            breakdown=[
                BreakdownRow("计算基数（本人工资）", f"¥ {_fmt(monthly_wage)}", "第 82 条"),
                BreakdownRow("未签合同月数（封顶 11）", f"{_fmt(m)} 个月", "第 82 条"),
                BreakdownRow("二倍工资差额", f"¥ {_round(amount):,}", "第 82 条"),
            ],
        ).to_dict()

    if scenario == "annual_leave":
        daily = monthly_wage / 21.75
        amount = daily * 2 * max(0.0, float(leave_days))  # 已付 100%，另行支付 200%
        return Result(
            n_months=0, multiplier=0, extra_months=0, monthly_wage=monthly_wage,
            amount=amount,
            label="未休年休假工资（额外 200%）",
            formula=f"日工资 {_round(daily):.2f} × 200% × {_fmt(leave_days)} 天",
            note="依据《职工带薪年休假条例》第 5 条：未休年假按日工资收入的 300% 支付，"
                 "其中包含用人单位已付的 100% 工资，故另行补发 200%。日工资 = 月薪 ÷ 21.75。",
            capped=False,
            breakdown=[
                BreakdownRow("日工资（月薪 ÷ 21.75）", f"¥ {_round(daily):.2f}", "条例第 5 条"),
                BreakdownRow("未休天数", f"{_fmt(leave_days)} 天", "条例第 5 条"),
                BreakdownRow("补发金额（日工资 × 200% × 天数）", f"¥ {_round(amount):,}", "条例第 5 条"),
            ],
        ).to_dict()

    if scenario == "overtime":
        hourly = monthly_wage / 21.75 / 8
        pay_normal = hourly * 1.5 * max(0.0, float(hrs_normal))
        pay_rest = hourly * 2.0 * max(0.0, float(hrs_rest))
        pay_legal = hourly * 3.0 * max(0.0, float(hrs_legal))
        amount = pay_normal + pay_rest + pay_legal
        return Result(
            n_months=0, multiplier=0, extra_months=0, monthly_wage=monthly_wage,
            amount=amount,
            label="加班费（按月估算）",
            formula=f"时薪 {_round(hourly):.2f} × (1.5×{_fmt(hrs_normal)} + 2×{_fmt(hrs_rest)} + 3×{_fmt(hrs_legal)})",
            note="依据《劳动法》第 44 条：延时加班 150%、休息日加班 200%（不补休时）、"
                 "法定节假日加班 300%。此处按月度小时数估算，未扣除已付的 100% 正常工作期工资。",
            capped=False,
            breakdown=[
                BreakdownRow("时薪（月薪 ÷ 21.75 ÷ 8）", f"¥ {_round(hourly):.2f}", "第 44 条"),
                BreakdownRow(f"延时加班 {_fmt(hrs_normal)} 小时 × 150%", f"¥ {_round(pay_normal):,}", "第 44 条"),
                BreakdownRow(f"休息日加班 {_fmt(hrs_rest)} 小时 × 200%", f"¥ {_round(pay_rest):,}", "第 44 条"),
                BreakdownRow(f"法定节假日加班 {_fmt(hrs_legal)} 小时 × 300%", f"¥ {_round(pay_legal):,}", "第 44 条"),
                BreakdownRow("本月加班费合计", f"¥ {_round(amount):,}", "第 44 条"),
            ],
        ).to_dict()

    if scenario == "work_injury":
        g = max(1, min(int(injury_grade), 10))
        months = INJURY_GRADE_MONTHS[g - 1]
        amount = monthly_wage * months
        return Result(
            n_months=0, multiplier=0, extra_months=0, monthly_wage=monthly_wage,
            amount=amount,
            label=f"工伤 {g} 级 · 一次性伤残补助金",
            formula=f"本人工资 {_fmt(monthly_wage)} × {months} 个月",
            note="依据《工伤保险条例》第 37 条：一次性伤残补助金按伤残等级支付，"
                 "标准为本人工资 × 对应月数（1 级 27 个月递减至 10 级 7 个月）。"
                 "此外还有一次性工伤医疗补助金、一次性伤残就业补助金（各省标准不同）及生活护理费，需另行核定。",
            capped=False,
            breakdown=[
                BreakdownRow("伤残等级", f"{g} 级", "条例第 37 条"),
                BreakdownRow("本人工资（计算基数）", f"¥ {_fmt(monthly_wage)}", "条例第 37 条"),
                BreakdownRow(f"补助金月数（{g} 级）", f"{months} 个月", "条例第 37 条"),
                BreakdownRow("一次性伤残补助金", f"¥ {_round(amount):,}", "条例第 37 条"),
            ],
        ).to_dict()

    # ---------------- 合法解除但无补偿类 ----------------
    if scenario in ("probation_fail", "serious_violation"):
        base_law = "第 39 条" if scenario == "serious_violation" else "第 39 条"
        title = "试用期不符合录用条件解除" if scenario == "probation_fail" else "严重违纪解除"
        return Result(
            n_months=0, multiplier=0, extra_months=0, monthly_wage=monthly_wage,
            amount=0.0,
            label=f"{title}（合法解除，无经济补偿）",
            formula="0 元",
            note="依据《劳动合同法》第 39 条：劳动者在试用期被证明不符合录用条件、"
                 "或严重违纪/严重失职的，用人单位可依法单方解除且无需支付经济补偿。"
                 "若单位**无法证明**上述情形而强行解除，则构成违法解除，须按 2N 赔偿。",
            capped=False,
            breakdown=[
                BreakdownRow("合法解除（单位有充分证据）", "无需支付经济补偿", "第 39 条"),
                BreakdownRow("若违法解除（证据不足）", f"2N = ¥ {_round(calc_n(work_years) * monthly_wage * 2):,}", "第 47、87 条"),
            ],
        ).to_dict()

    # ---------------- 解除 / 终止类（N / 2N / +1）----------------
    n = calc_n(work_years)
    capped = False
    base = float(monthly_wage)

    # 第 47 条第 2 款：高于社平三倍的，按三倍计，且年限最高 12 年
    if local_avg_wage and local_avg_wage > 0:
        cap = local_avg_wage * 3
        if base > cap:
            base = cap
            capped = True
        if capped and n > 12:
            n = 12.0

    multiplier = 2.0 if scenario in ("illegal", "maternity") else 1.0
    extra = 1.0 if (advance_notice and scenario in ("incompetent", "objective")) else 0.0
    amount = n * base * multiplier + extra * base

    labels = {
        "negotiate": "协商一致解除经济补偿金（N）",
        "incompetent": "不能胜任工作解除经济补偿金（N）",
        "objective": "客观情况变化解除经济补偿金（N）",
        "layoff": "经济性裁员经济补偿金（N）",
        "illegal": "违法解除劳动合同赔偿金（2N）",
        "maternity": "女职工三期违法解除赔偿金（2N）",
    }
    notes = {
        "negotiate": "依据《劳动合同法》第 46、47 条，协商一致解除按工作年限每满一年支付一个月工资。",
        "incompetent": "依据《劳动合同法》第 40、46、47 条，不能胜任经培训或调岗仍不能胜任的，"
                       "提前 30 日书面通知或支付代通知金后解除，按工作年限支付 N。",
        "objective": "依据《劳动合同法》第 40、46、47 条，客观情况重大变化致使合同无法履行，"
                     "经协商未能就变更合同达成一致的，提前 30 日书面通知或支付代通知金后解除，支付 N。",
        "layoff": "依据《劳动合同法》第 41、46、47 条，经济性裁员按工作年限支付 N。",
        "illegal": "依据《劳动合同法》第 87 条，违法解除按经济补偿标准的二倍支付（2N）。",
        "maternity": "依据《劳动合同法》第 42、87 条，女职工在孕期、产期、哺乳期受解雇保护，"
                     "违法解除按 2N 赔偿。",
    }

    parts = [f"N = {_fmt(n)} 个月", f"基数 {_fmt(base)} 元"]
    if multiplier == 2:
        parts.append("× 2（违法解除）")
    if extra:
        parts.append(f"+ {_fmt(extra)} 个月代通知金")
    formula = f"{_fmt(n)} × {_fmt(base)}" + (" × 2" if multiplier == 2 else "")
    if extra:
        formula += f" + {_fmt(base)}"

    note = notes[scenario]
    if capped:
        note += " 已按当地社平工资三倍封顶，且年限最高按 12 年计。"
    elif not local_avg_wage:
        note += "（未提供当地社平工资，未做三倍封顶校验；高薪情形请自行核对。）"

    breakdown = [
        BreakdownRow("计算基数（离职前 12 个月平均应发工资）", f"¥ {_fmt(base)}", "第 47 条"),
        BreakdownRow("工作年限折算 N", f"{_fmt(n)} 个月", "第 47 条"),
    ]
    if multiplier == 2:
        breakdown.append(BreakdownRow("赔偿倍数", "× 2（违法解除 2N）", "第 87 条"))
    else:
        breakdown.append(BreakdownRow("补偿倍数", "× 1（N）", "第 46、47 条"))
    if extra:
        breakdown.append(BreakdownRow("代通知金（未提前 30 日通知）", f"+ 1 个月 = ¥ {_round(base):,}", "第 40 条"))
    breakdown.append(BreakdownRow("合计金额", f"¥ {_round(amount):,}", "第 47 条" + ("、87 条" if multiplier == 2 else "")))

    return Result(
        n_months=n,
        multiplier=multiplier,
        extra_months=extra,
        monthly_wage=base,
        amount=amount,
        label=labels[scenario],
        formula=formula,
        note=note,
        capped=capped,
        breakdown=breakdown,
    ).to_dict()


if __name__ == "__main__":
    import json
    for s in ("illegal", "negotiate", "no_fault_legacy", "double_wage", "annual_leave", "overtime", "work_injury", "probation_fail"):
        try:
            if s == "no_fault_legacy":
                continue
            kw = {}
            if s == "double_wage":
                kw = {"unsigned_months": 5}
            if s == "annual_leave":
                kw = {"leave_days": 10}
            if s == "overtime":
                kw = {"hrs_normal": 20, "hrs_rest": 16, "hrs_legal": 3}
            if s == "work_injury":
                kw = {"injury_grade": 7}
            r = calc_compensation(8000, 3, s, **kw)
            print(s, "->", r["label"], "¥", r["amount"], "| 明细", len(r["breakdown"]), "行")
        except Exception as e:
            print(s, "ERR", e)
