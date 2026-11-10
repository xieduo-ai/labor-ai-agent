"""试用期上限确定性规则回归测试。

复现的真实事故：三年期 + 六个月试用期的合同，线上有时报「试用期超过法定上限」
（自相矛盾地建议「调整为不超过六个月」），有时又判对 —— 结论随模型采样漂移。

本测试分两层：
  A. 纯规则层（不调模型）：分档边界、误报删除、漏报补齐、工资类问题不误删。
  B. 端到端（调真实检索 + 模型）：同一份三年期合同连跑 N 次，断言结果一致且无误报；
     两年期合同仍必须报出试用期超期，保证 19/19 埋点召回不回退。

跑法（用项目 conda 环境，别用系统 python）：
    E:\\Anaconda\\envs\\laborai\\python.exe eval\\test_probation_rules.py
    E:\\Anaconda\\envs\\laborai\\python.exe eval\\test_probation_rules.py --e2e
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.compliance_rules import (  # noqa: E402
    enforce_probation_rules,
    evaluate_probation,
    probation_limit_months,
)

THREE_YEAR = (
    "第一条 本合同为固定期限劳动合同，合同期限为三年，"
    "自2026年1月1日起至2028年12月31日止，其中试用期六个月。\n"
    "第二条 乙方自愿放弃缴纳社会保险，甲方将相应费用直接计入乙方工资。\n"
    "第三条 甲方每月10日以货币形式足额支付乙方工资。"
)
TWO_YEAR = (
    "第一条 本合同为固定期限劳动合同，合同期限为两年，"
    "自2026年1月1日起至2027年12月31日止，其中试用期六个月，"
    "试用期工资为每月2000元，转正后每月8000元。\n"
    "第二条 乙方自愿放弃缴纳社会保险，甲方将相应费用直接计入乙方工资。\n"
    "第三条 甲方每月10日以货币形式足额支付乙方工资。"
)

# 模拟检索候选里的《劳动合同法》第十九条
ART19 = (
    "劳动合同期限三个月以上不满一年的，试用期不得超过一个月；"
    "劳动合同期限一年以上不满三年的，试用期不得超过二个月；"
    "三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。"
)
HITS = [{"law_name": "中华人民共和国劳动合同法", "article_no": "第十九条", "text": ART19}]

_failed = 0


def check(cond: bool, label: str, detail: str = "") -> None:
    global _failed
    if cond:
        print(f"  PASS  {label}")
    else:
        _failed += 1
        print(f"  FAIL  {label}  {detail}")


def test_rule_layer() -> None:
    print("\n[A] 纯规则层（不调模型）")
    check(probation_limit_months(2) == 0, "期限 2 个月 -> 不得约定试用期")
    check(probation_limit_months(6) == 1, "期限 6 个月 -> 上限 1 个月")
    check(probation_limit_months(23) == 2, "期限 23 个月 -> 上限 2 个月")
    check(probation_limit_months(35.99) == 2, "差一点满三年 -> 上限 2 个月")
    check(probation_limit_months(36) == 6, "正好三年（含本数）-> 上限 6 个月")
    check(probation_limit_months(float("inf")) == 6, "无固定期限 -> 上限 6 个月")
    check(probation_limit_months(None) is None, "期限缺失 -> 不猜，返回 None")

    e3 = evaluate_probation(THREE_YEAR)
    check(e3["exceeded"] is False, "三年期六个月 -> 合法", e3["verdict"])
    check("3 年" in e3["verdict"], "结论里写明合同期限", e3["verdict"])
    e2 = evaluate_probation(TWO_YEAR)
    check(e2["exceeded"] is True, "两年期六个月 -> 确实超期", e2["verdict"])
    check("2 年" in e2["verdict"], "两年期结论里写明期限", e2["verdict"])

    # 模型误报「试用期超过法定上限」：必须被删除
    false_alarm = [{
        "risk_level": "高", "risk_type": "试用期",
        "issue": "试用期超过法定上限", "suggestion": "将试用期调整为不超过六个月",
        "legal_basis": [], "insufficient_basis": False,
    }]
    out, audit = enforce_probation_rules(false_alarm, "第一条 合同期限为三年，其中试用期六个月", THREE_YEAR, HITS)
    check(len(out) == 0, "三年期误报被删除", str(out))
    check(audit["applied"] and audit["action"].startswith("删除"), "审计记录标记删除", str(audit))

    # 试用期工资问题（第二十条）不能被误删
    wage_issue = [{
        "risk_level": "高", "risk_type": "薪酬",
        "issue": "试用期工资低于转正工资的80%", "suggestion": "补足至80%以上",
        "legal_basis": [], "insufficient_basis": False,
    }]
    out2, _ = enforce_probation_rules(wage_issue, "第一条 合同期限为两年，其中试用期六个月", TWO_YEAR, HITS)
    # 两年期确实超期，规则引擎会额外补一条期限风险；这里只断言工资问题本身没被误删
    check(any("工资" in it["issue"] for it in out2), "工资类问题原样保留", str(out2))
    check(any(it.get("rule_verified") for it in out2), "同时补上了期限超期", str(out2))

    # 两年期、模型漏报超期 -> 补一条带闭集引用的高风险
    out3, audit3 = enforce_probation_rules([], "第一条 合同期限为两年，其中试用期六个月", TWO_YEAR, HITS)
    check(len(out3) == 1 and out3[0]["risk_level"] == "高", "漏报被补上高风险", str(out3))
    check(bool(out3[0]["legal_basis"]) and out3[0]["legal_basis"][0]["exists"],
          "补报的引用来自闭集候选（第十九条）", str(out3[0]["legal_basis"]))

    # 无关条款不许被硬塞风险
    out4, audit4 = enforce_probation_rules([], "第三条 甲方每月10日以货币形式足额支付乙方工资", TWO_YEAR, HITS)
    check(len(out4) == 0, "无试用期约定的合规条款不被补报", str(out4))
    check("未约定试用期" in audit4["action"], "审计记录说明未干预原因", str(audit4))

    # 背景污染副作用：模型把第一条的试用期坑重复报到社保/发薪条款上，必须被清掉
    polluted = [
        {"risk_level": "高", "risk_type": "社保", "issue": "约定劳动者自愿放弃缴纳社会保险无效",
         "suggestion": "删除该条款", "legal_basis": [], "insufficient_basis": False},
        {"risk_level": "高", "risk_type": "试用期", "issue": "试用期超过法定上限",
         "suggestion": "调整试用期", "legal_basis": [], "insufficient_basis": False},
        {"risk_level": "高", "risk_type": "薪酬", "issue": "试用期工资低于转正工资的80%",
         "suggestion": "补足差额", "legal_basis": [], "insufficient_basis": False},
    ]
    out5, audit5 = enforce_probation_rules(
        polluted, "第二条 乙方自愿放弃缴纳社会保险，甲方将相应费用直接计入乙方工资", TWO_YEAR, HITS
    )
    check(len(out5) == 1 and "社保" in out5[0]["risk_type"],
          "无关条款上重复的试用期结论被清掉，社保结论保留", str(out5))
    check("删除无关条款" in audit5["action"], "审计记录标记背景污染清理", str(audit5))


def test_e2e(repeats: int) -> None:
    print(f"\n[B] 端到端（真实检索 + 模型），三年期连跑 {repeats} 次")
    import config
    from src.review import review_clause, split_clauses

    config.sanity_check()
    clauses = split_clauses(THREE_YEAR)
    ctx = next(c for c in clauses if "合同期限" in c)

    signatures = []
    for i in range(1, repeats + 1):
        res = review_clause(clauses[0], contract_ctx=ctx, contract_text=THREE_YEAR)
        types = sorted(
            (it["risk_type"], it["issue"]) for it in res["issues"]
            if it["risk_level"] in ("高", "中", "低")
        )
        signatures.append(tuple(types))
        has_false_alarm = any("超过" in it["issue"] and "试用期" in it["issue"] for it in res["issues"])
        check(not has_false_alarm, f"第 {i} 次：无误报「试用期超过法定上限」", str(types))
        print(f"        audit: {res['rule_audit']['action']}")
    check(len(set(signatures)) == 1, f"{repeats} 次结论完全一致（无漂移）", str(signatures))

    print("\n[B] 两年期仍须报出试用期超期（保住 19/19 召回）")
    c2 = split_clauses(TWO_YEAR)
    ctx2 = next(c for c in c2 if "合同期限" in c)
    res2 = review_clause(c2[0], contract_ctx=ctx2, contract_text=TWO_YEAR)
    issues2 = [it["issue"] for it in res2["issues"] if it["risk_level"] in ("高", "中", "低")]
    check(any("试用期" in s and ("超过" in s or "上限" in s) for s in issues2),
          "两年期六个月判为超期", str(issues2))
    print(f"        实际 issues: {issues2}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--e2e", action="store_true", help="额外跑真实模型端到端测试")
    ap.add_argument("--repeats", type=int, default=3)
    args = ap.parse_args()
    test_rule_layer()
    if args.e2e:
        test_e2e(args.repeats)
    print(f"\n结果：{'全部通过' if _failed == 0 else f'{_failed} 项失败'}")
    raise SystemExit(1 if _failed else 0)
