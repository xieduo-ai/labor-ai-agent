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
"""
from dataclasses import dataclass

# 情形 -> 说明。前端单选、Agent 工具枚举都从这里取，避免两边文案不一致
SCENARIOS = {
    "illegal": "用人单位违法解除或终止劳动合同（如无理由辞退、末位淘汰、孕期辞退）",
    "normal": "协商一致解除、经济性裁员、客观情况发生重大变化",
    "no_fault": "医疗期满 / 不能胜任工作 / 客观情况变化，且单位未提前 30 日书面通知",
    "expire": "劳动合同到期，单位不续签或降低条件导致不续签",
}


@dataclass
class Result:
    n_months: float          # 补偿月数（N）
    multiplier: float        # 倍数：1 = N，2 = 2N
    extra_months: float      # 代通知金（+1）
    monthly_wage: float      # 计算基数（可能被三倍封顶）
    amount: float            # 最终金额
    label: str
    formula: str
    note: str
    capped: bool             # 是否触发三倍封顶 / 12 年年限上限

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


def calc_compensation(
    monthly_wage: float,
    work_years: float,
    scenario: str = "illegal",
    local_avg_wage: float | None = None,
) -> dict:
    """计算补偿/赔偿金额。

    Args:
        monthly_wage: 离职前 12 个月平均应发工资（元）
        work_years:   在本单位工作年限（年，可含小数）
        scenario:     illegal / normal / no_fault / expire
        local_avg_wage: 当地上年度职工月平均工资。给了才做三倍封顶判断；
                        不给则按实发工资算，并在 note 里提示未做封顶校验。

    Returns:
        dict，字段见 Result.to_dict()
    """
    if monthly_wage <= 0:
        raise ValueError("月薪必须大于 0")
    if work_years < 0:
        raise ValueError("工作年限不能为负")
    if scenario not in SCENARIOS:
        raise ValueError(f"未知情形：{scenario}，可选 {list(SCENARIOS)}")

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

    multiplier = 2.0 if scenario == "illegal" else 1.0
    extra = 1.0 if scenario == "no_fault" else 0.0

    amount = n * base * multiplier + extra * base

    labels = {
        "illegal": "违法解除劳动合同赔偿金（2N）",
        "normal": "解除劳动合同经济补偿金（N）",
        "no_fault": "经济补偿金 + 代通知金（N+1）",
        "expire": "合同到期不续签经济补偿金（N）",
    }
    notes = {
        "illegal": "依据《劳动合同法》第 87 条，违法解除按经济补偿标准的二倍支付。",
        "normal": "依据《劳动合同法》第 46、47 条，按工作年限每满一年支付一个月工资。",
        "no_fault": "依据《劳动合同法》第 40 条，未提前 30 日书面通知的，需额外支付一个月工资。",
        "expire": "依据《劳动合同法》第 46 条第 5 项，除用人单位维持或提高条件续订而劳动者不同意外，"
                  "合同到期终止应支付经济补偿。",
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
    ).to_dict()


def _fmt(x: float) -> str:
    """3.0 -> '3'，3.5 -> '3.5'，避免出现 '3.0 个月' 这种别扭写法。"""
    return str(int(x)) if float(x).is_integer() else str(x)
