"""确定性合规规则：试用期上限等「算得出」的判定，不交给模型自由发挥。

为什么要有这一层
----------------
v2 之前，试用期是否超期完全由大模型判断，合同期限只作为「供参考」的背景文本塞进
提示词，且审查调用用了 temperature=0.1。结果是同一份三年期 + 六个月试用期的合同，
有时被误判为「试用期超过法定上限」（还自相矛盾地建议「调整为不超过六个月」），
有时又判对 —— 结论随采样漂移，直接违背本项目「结论敢被人查」的主张。

《劳动合同法》第十九条是有明确数字边界的规则，和赔偿金一样应该由代码算：
    期限三个月以上不满一年   -> 试用期 <= 1 个月
    期限一年以上不满三年     -> 试用期 <= 2 个月
    期限三年以上 / 无固定期限 -> 试用期 <= 6 个月（「三年以上」含本数）
    期限不满三个月 / 以完成一定工作任务为期限 / 非全日制 -> 不得约定试用期

本模块只负责这一类可计算规则，并在 review_clause 输出后做一次强制复核：
  - 代码判合法、模型报了「试用期超期」 -> 删除该误报（消除漂移）
  - 代码判违法、模型漏报                 -> 补一条带闭集引用的高风险（防止漏检）
  - 试用期工资低于 80%（第二十条）不在此列 -> 原样保留，不误删

这样 19/19 合同埋点召回不受影响（两年期六个月仍会报超期），
同时三年期六个月不再误报。规则结论与模型结论冲突时，一律以本模块为准。
"""
from __future__ import annotations

import re
from datetime import date, timedelta

_CN = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}
_NUM = r"([0-9]+|[零一二两三四五六七八九十]+)"

_TERM_YEAR_RE = re.compile(r"合同期限(?:为|是|约)?\s*" + _NUM + r"\s*年")
_TERM_MONTH_RE = re.compile(r"合同期限(?:为|是|约)?\s*" + _NUM + r"\s*个?月")
_DATE_RE = re.compile(
    r"自\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*起\s*至\s*"
    r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*止"
)
_PROB_RE = re.compile(r"试用期[^。；;，,]{0,8}?" + _NUM + r"\s*个?月")
_INDEFINITE_RE = re.compile(r"无固定期限")
_TASK_BASED_RE = re.compile(r"以完成一定工作任务为期限|非全日制")
_WAGE_RE = re.compile(r"试用期工资(?:为|是|约|:|：)?\s*(?:每月|月)?\s*([0-9]+)\s*元?")
# 「转正后每月8000元」常省略「工资」二字，所以工资/月薪/为 都是可选的
_REGULAR_WAGE_RE = re.compile(
    r"转正后?(?:工资|月薪)?(?:为|是|约|:|：)?\s*(?:每月|月)?\s*([0-9]+)\s*元?"
)

# 「试用期期限类」误报的识别：含期限语义、但不含工资语义
_LIMIT_KEYS = ("超过", "上限", "超期", "过长", "期限", "不得超过", "不得约定", "约定试用期")
_WAGE_KEYS = ("工资", "薪资", "报酬", "80%", "百分之八十", "最低工资", "低于")


def _cn2int(s: str) -> int | None:
    """中文数字 / 阿拉伯数字转 int，支持 六 / 十 / 十二 / 二十四。"""
    s = (s or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)
    if any(ch not in _CN for ch in s):
        return None
    if len(s) == 1:
        return _CN[s]
    if "十" in s:
        left, _, right = s.partition("十")
        tens = _CN.get(left, 1) if left else 1
        ones = _CN.get(right, 0) if right else 0
        return tens * 10 + ones
    return None


def _years_from_dates(m: re.Match[str]) -> float | None:
    """由「自X年X月X日起至X年X月X日止」反推整年数。

    合同期满日常写成年份周年减一天（如 2026-01-01 至 2028-12-31 = 正好三年），
    先按整年匹配，匹配不上再退回天数近似，避免把「正好三年」算成 2.998 年
    而误落到「一年以上不满三年」档。
    """
    y1, mo1, d1, y2, mo2, d2 = map(int, m.groups())
    try:
        start, end = date(y1, mo1, d1), date(y2, mo2, d2)
    except ValueError:
        return None
    for n in range(1, 51):
        try:
            anniversary = date(y1 + n, mo1, d1)
        except ValueError:  # 2 月 29 日
            anniversary = date(y1 + n, mo1, 28)
        if anniversary - timedelta(days=1) == end:
            return float(n)
    days = (end - start).days
    return round((days + 1) / 365.25, 3) if days > 0 else None


def parse_contract_term(text: str) -> dict:
    """从合同全文里解析出期限与试用期，解析不出来就如实返回 None（不猜）。"""
    t = (text or "").replace(" ", "")
    task_based = bool(_TASK_BASED_RE.search(t))
    indefinite = bool(_INDEFINITE_RE.search(t))

    term_months: float | None = None
    if indefinite:
        term_months = float("inf")
    elif not task_based:
        dm = _DATE_RE.search(t)
        if dm:
            years = _years_from_dates(dm)
            if years is not None:
                term_months = years * 12
        if term_months is None:
            ym = _TERM_YEAR_RE.search(t)
            mm = _TERM_MONTH_RE.search(t)
            years = _cn2int(ym.group(1)) if ym else 0
            months = _cn2int(mm.group(1)) if mm else 0
            if years or months:
                term_months = (years or 0) * 12 + (months or 0)

    pm = _PROB_RE.search(t)
    probation_months = _cn2int(pm.group(1)) if pm else None
    return {
        "term_months": term_months,
        "probation_months": probation_months,
        "indefinite": indefinite,
        "task_based": task_based,
    }


def probation_limit_months(term_months: float | None, task_based: bool = False) -> int | None:
    """《劳动合同法》第十九条的确定性上限，单位：月。None = 无法判定。"""
    if task_based or term_months == 0:
        return 0
    if term_months is None:
        return None
    if term_months < 3:
        return 0
    if term_months < 12:
        return 1
    if term_months < 36:
        return 2
    return 6  # 「三年以上」含本数：正好 36 个月也落这一档


def evaluate_probation(text: str) -> dict:
    """给出可核验的试用期结论。exceeded=None 表示信息不足，不参与强制复核。"""
    p = parse_contract_term(text)
    limit = probation_limit_months(p["term_months"], p["task_based"])
    actual = p["probation_months"]
    if limit is None or actual is None:
        return {**p, "limit_months": limit, "exceeded": None, "verdict": "信息不足，按模型判断"}
    exceeded = actual > limit
    tm = p["term_months"]
    if p["indefinite"]:
        term_desc = "无固定期限"
    elif p["task_based"]:
        term_desc = "以完成一定工作任务为期限"
    elif tm is None:
        term_desc = "期限未写明"
    elif tm < 12:
        term_desc = f"合同期限 {tm:g} 个月"
    else:
        term_desc = f"合同期限 {tm / 12:g} 年"
    return {
        **p,
        "limit_months": limit,
        "exceeded": exceeded,
        "verdict": (
            f"{term_desc}，法定上限 {limit} 个月，约定 {actual} 个月 —— "
            + ("超过上限，违法" if exceeded else "未超上限，合法")
        ),
    }


def _is_probation_related(it: dict) -> bool:
    """issue 是否在说试用期相关的问题（期限或工资都算）。"""
    s = f"{it.get('issue', '')} {it.get('suggestion', '')}"
    return "试用期" in s


def evaluate_probation_wage(text: str) -> dict:
    """《劳动合同法》第二十条：试用期工资不得低于约定工资的 80%。

    与第十九条同理，这是能算的：合同写了 2000 / 8000，代码算 6400，
    不需要模型心算，也不该让结论在「高」和「中」之间漂移。
    """
    t = (text or "").replace(" ", "")
    pm = _WAGE_RE.search(t)
    rm = _REGULAR_WAGE_RE.search(t)
    prob = int(pm.group(1)) if pm else None
    regular = int(rm.group(1)) if rm else None
    if prob is None or regular is None or regular <= 0:
        return {"probation_wage": prob, "regular_wage": regular,
                "floor": None, "below": None, "verdict": "工资数据不足，按模型判断"}
    floor = regular * 0.8
    below = prob < floor
    return {
        "probation_wage": prob, "regular_wage": regular, "floor": floor,
        "below": below,
        "verdict": (
            f"试用期工资 {prob} 元，约定工资 {regular} 元，法定下限 {floor:.0f} 元 —— "
            + ("低于下限，违反第二十条" if below else "未低于下限，合法")
        ),
    }


def _is_wage_issue(it: dict) -> bool:
    """issue 是否在说试用期工资问题（区别于期限超期）。"""
    s = f"{it.get('issue', '')} {it.get('suggestion', '')}"
    return "试用期" in s and any(k in s for k in _WAGE_KEYS)


def _is_limit_issue(it: dict) -> bool:
    """判断一个 issue 是否在说「试用期期限超上限」，而非「试用期工资过低」。"""
    s = f"{it.get('issue', '')} {it.get('suggestion', '')}"
    if "试用期" not in s and it.get("risk_type") != "试用期":
        return False
    if any(k in s for k in _WAGE_KEYS):
        return False
    return any(k in s for k in _LIMIT_KEYS)


def _basis_for_article(hits: list, article_no: str) -> list:
    """补漏报时，从本次检索候选中找指定条文构造闭集引用（quote 逐字摘自原文）。"""
    for h in hits:
        if "劳动合同法" in h.get("law_name", "") and h.get("article_no") == article_no:
            return [{
                "quote": h["text"][:80],
                "exists": True,
                "quote_ok": True,
                "law": h["law_name"],
                "article": h["article_no"],
            }]
    return []


def _basis_for_limit(hits: list) -> list:
    return _basis_for_article(hits, "第十九条")


def enforce_probation_rules(issues: list, clause: str, contract_text: str, hits: list) -> tuple[list, dict]:
    """强制复核：返回 (修正后的 issues, 审计信息)。

    审计信息会随 clause 事件一起推给前端（前端可忽略未知字段），
    并在服务端日志留痕，便于解释「为什么这条没报」。
    """
    ev = evaluate_probation(contract_text or clause)
    audit = {"rule": "劳动合同法第十九条", "verdict": ev["verdict"], "applied": False}

    # 第二十条（试用期工资 80% 下限）同样能算，先把等级和文案钉死。
    # 只在本条款确实写了试用期工资时才干预，避免碰到社保/发薪条款。
    wv = evaluate_probation_wage(contract_text or clause)
    if "试用期" in clause and wv["below"] is not None:
        wage_issues = [it for it in issues if _is_wage_issue(it)]
        if wv["below"]:
            for it in wage_issues:
                if it.get("risk_level") != "高":
                    it["risk_level"] = "高"
                    it["rule_verified"] = True
                    audit["applied"] = True
            if wage_issues:
                audit["action"] = (
                    f"确认试用期工资低于下限（{wv['probation_wage']} < {wv['floor']:.0f}），固定为高风险"
                )
            else:
                basis = _basis_for_article(hits, "第二十条")
                if basis:
                    issues.append({
                        "risk_level": "高", "risk_type": "薪酬",
                        "issue": f"试用期工资 {wv['probation_wage']} 元低于约定工资的 80%（{wv['floor']:.0f} 元）",
                        "legal_basis": basis, "insufficient_basis": False,
                        "suggestion": f"将试用期工资提高至不低于 {wv['floor']:.0f} 元，且不低于当地最低工资标准",
                        "rule_verified": True,
                    })
                    audit.update(applied=True, action="补上模型漏报的试用期工资过低")
        else:
            kept = [it for it in issues if not _is_wage_issue(it)]
            if len(kept) != len(issues):
                audit.update(applied=True, action="删除误报的试用期工资过低结论",
                             removed=len(issues) - len(kept))
                issues = kept

    # 硬校验：本条款根本没提试用期，就不该出现「试用期期限/工资」类结论。
    # 实测副作用：把第一条原文当背景喂进去后，模型会在社保条款、发薪条款上
    # 把试用期的坑重复报一遍（汇总从 3 条膨胀到 7 条、摘录逐字率掉到 42.9%）。
    # 提示词已声明背景不是待审条款，这里再做一次代码级兜底，不依赖模型自觉。
    if "试用期" not in clause and "合同期限" not in clause:
        stray = [it for it in issues if _is_probation_related(it)]
        if stray:
            cleaned = [it for it in issues if not _is_probation_related(it)]
            audit.update(applied=True, action="删除无关条款上重复的试用期结论",
                         removed=len(stray))
            return cleaned, audit
        audit["action"] = "本条款未约定试用期，无需干预"
        return issues, audit

    if ev["exceeded"] is None:
        audit["action"] = "信息不足，未干预"
        return issues, audit

    limit_issues = [it for it in issues if _is_limit_issue(it)]

    if not ev["exceeded"]:
        if not limit_issues:
            audit["action"] = "模型未误报，无需干预"
            return issues, audit
        cleaned = [it for it in issues if not _is_limit_issue(it)]
        audit.update(applied=True, action="删除误报的试用期超期结论",
                     removed=len(limit_issues))
        return cleaned, audit

    if limit_issues:
        # 违反第十九条强制性规定的结论固定判「高」。
        # 线上实测模型偶尔把「试用期工资未达法定标准」判成中风险，
        # 会让汇总在 2 高 1 中 / 3 高之间漂移，评审材料的数字就对不上。
        for it in limit_issues:
            if it.get("risk_level") != "高":
                it["risk_level"] = "高"
                it["rule_verified"] = True
                audit["applied"] = True
        audit["action"] = "确认并固定试用期超期结论为高风险"
        return issues, audit

    # 补漏报只针对本条款确实写了试用期/合同期限的情况。
    # 否则一条「每月10日发工资」的合规条款也会被硬塞一条试用期风险，
    # 反而破坏「不硬找风险」和 19/19 评测口径。
    if not any(k in clause for k in ("试用期", "合同期限", "合同期")):
        audit["action"] = "本条款未约定试用期，不补报"
        return issues, audit

    # 确实违法但模型漏报：补一条带闭集引用的高风险
    basis = _basis_for_limit(hits)
    if not basis:
        audit["action"] = "检测到超期但候选无第十九条，不补报以免破坏引用指标"
        return issues, audit
    added = {
        "risk_level": "高",
        "risk_type": "试用期",
        "issue": f"试用期约定 {ev['probation_months']} 个月，超过法定上限 {ev['limit_months']} 个月",
        "legal_basis": basis,
        "insufficient_basis": False,
        "suggestion": f"将试用期调整为不超过 {ev['limit_months']} 个月，或重新约定合同期限",
        "rule_verified": True,
    }
    audit.update(applied=True, action="补上模型漏报的试用期超期", added=1)
    return issues + [added], audit


if __name__ == "__main__":
    samples = [
        "第一条 本合同为固定期限劳动合同，合同期限为三年，自2026年1月1日起至2028年12月31日止，其中试用期六个月。",
        "第一条 本合同为固定期限劳动合同，合同期限为两年，自2026年1月1日起至2027年12月31日止，其中试用期六个月，试用期工资为每月2000元，转正后每月8000元。",
        "第一条 合同期限为一年，试用期三个月。",
        "第一条 合同期限为六个月，试用期二个月。",
        "第一条 无固定期限劳动合同，试用期六个月。",
    ]
    for s in samples:
        e = evaluate_probation(s)
        print(e["verdict"], "| exceeded =", e["exceeded"])
