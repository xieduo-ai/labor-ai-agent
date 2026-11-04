"""合同审查：切条款 -> 逐条检索法条 -> 模型判风险 -> 汇总报告。

这一步是项目的差异点。市面上劳动法问答很多，但「上传合同、输出风险清单、每条带法条溯源」
的产品很少，因为它既需要工程又需要劳动法功底 —— 正好是你的组合。

v2（2026-11-04）两个关键改动：
1. **closed-set 引用**：候选法条带编号喂给模型，模型只能用 idx 引用，
   后端按编号反查重建 (法律名, 条号)——结构上杜绝"编一个库里真实存在但法理不对"的引用。
2. **多问题拆分**：一个条款允许多个独立 issue（旧版单对象 schema 会漏掉
   "试用期超上限 + 试用期工资过低"这种同条款双坑）。
"""
import json
import re
import sys

import config
from src.llm import chat
from src.prompts import REVIEW_SYSTEM
from src.retrieve import search

# 条款开头：第X条 / 一、 / 1. / （一）
CLAUSE_RE = re.compile(
    r"^\s*(第[一二三四五六七八九十百零]+条|[一二三四五六七八九十]+[、．.]|\d+[、．.]|（[一二三四五六七八九十]+）)"
)

_LEVELS = {"高", "中", "低"}


def split_clauses(text: str):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    clauses, cur = [], []
    for line in lines:
        if CLAUSE_RE.match(line) and cur:
            clauses.append("\n".join(cur))
            cur = [line]
        else:
            cur.append(line)
    if cur:
        clauses.append("\n".join(cur))
    return [c for c in clauses if len(c) >= 15]


def _norm(s: str) -> str:
    """比对 quote 是否逐字摘录时，抹掉空白和标点差异。"""
    return re.sub(r"[^\u4e00-\u9fff0-9a-zA-Z]", "", s or "")


def _parse_issues(raw: str, hits: list) -> list:
    """解析模型输出并做 closed-set 校验：basis 只认候选编号，其余按无效引用计。"""
    try:
        data = json.loads(raw)
        issues = data.get("issues")
        if not isinstance(issues, list):
            issues = []
    except json.JSONDecodeError:
        issues = [{
            "risk_level": "未知", "risk_type": "其他",
            "issue": "模型输出无法解析", "legal_basis": [], "suggestion": "",
        }]

    out = []
    for it in issues:
        if not isinstance(it, dict):
            continue
        level = it.get("risk_level")
        if level not in _LEVELS:
            level = "未知"

        basis = []
        for b in it.get("basis") or []:
            if isinstance(b, dict):
                idx, quote = b.get("idx"), str(b.get("quote", "")).strip()
            else:  # 模型只给了一个数字
                idx, quote = b, ""
            entry = {"quote": quote, "exists": False, "quote_ok": False}
            if isinstance(idx, int) and 1 <= idx <= len(hits):
                h = hits[idx - 1]
                entry["law"] = h["law_name"]
                entry["article"] = h["article_no"]
                entry["exists"] = True
                entry["quote_ok"] = bool(quote) and _norm(quote) in _norm(h["text"])
            else:  # 编号越界 / 非整数：按无效引用保留，进 citation_valid_rate 统计
                entry["law"] = "（候选外引用）"
                entry["article"] = str(idx)
            basis.append(entry)

        out.append({
            "risk_level": level,
            "risk_type": it.get("risk_type") or "其他",
            "issue": str(it.get("issue", "")).strip(),
            "legal_basis": basis,
            # 高/中风险却给不出依据：如实标出来，不许"看起来有依据"
            "insufficient_basis": level in ("高", "中", "未知") and not basis,
            "suggestion": str(it.get("suggestion", "")).strip(),
        })
    return out


def _clause_label(clause: str, seq: int) -> str:
    """条款标签：优先用合同自己的「第X条」，否则用序号。"""
    m = CLAUSE_RE.match(clause.strip())
    if m:
        return m.group(1)
    return f"第{seq}项"


def review_clause(clause: str, contract_ctx: str = "", top_k: int = 6) -> dict:
    hits = search(clause, top_k=top_k)
    ctx = "\n\n".join(
        f"[{i}] 《{h['law_name']}》{h['article_no']}\n{h['text']}"
        for i, h in enumerate(hits, 1)
    )
    bg = f"合同背景（仅供判断参考，如试用期上限取决于合同期限；它不是待审查条款）：\n{contract_ctx}\n\n" if contract_ctx else ""
    messages = [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": f"{bg}候选条文：\n\n{ctx}\n\n待审查条款：\n{clause}"},
    ]
    raw = chat(messages, json_mode=True)
    return {
        "issues": _parse_issues(raw, hits),
        "sources": [{"law_name": h["law_name"], "article_no": h["article_no"]} for h in hits],
    }


def review_contract(text: str, max_clauses: int = 40) -> dict:
    config.sanity_check()
    clauses = split_clauses(text)[:max_clauses]

    # 合同期限是很多判断的前置条件（试用期上限、固定/无固定期限），单审一条时必须带上
    contract_ctx = next(
        (c for c in clauses if "合同期限" in c or c.lstrip().startswith("第一条")), ""
    )

    items = []
    for i, clause in enumerate(clauses, 1):
        print(f"[{i}/{len(clauses)}] 审查中 ...", file=sys.stderr)
        res = review_clause(clause, contract_ctx=contract_ctx)
        base = {"clause": clause, "clause_label": _clause_label(clause, i), "sources": res["sources"]}
        if res["issues"]:
            for it in res["issues"]:
                items.append({**base, **it})
        else:
            items.append({**base, "risk_level": "无", "risk_type": "其他",
                          "issue": "未发现明显风险", "legal_basis": [],
                          "insufficient_basis": False, "suggestion": ""})

    order = {"高": 0, "中": 1, "低": 2, "无": 3, "未知": 4}
    items.sort(key=lambda r: order.get(r["risk_level"], 9))

    cited = [b for r in items for b in r["legal_basis"]]
    summary = {
        "clauses": len(clauses),
        "issues": sum(r["risk_level"] in ("高", "中", "低") for r in items),
        "high": sum(r["risk_level"] == "高" for r in items),
        "mid": sum(r["risk_level"] == "中" for r in items),
        "low": sum(r["risk_level"] == "低" for r in items),
        # 高/中风险但候选条文里挑不出依据的条目数
        "insufficient_basis": sum(bool(r.get("insufficient_basis")) for r in items),
        # 引用有效率：closed-set 下 = 引用编号命中的比例（含候选外引用的计数）
        "citation_valid_rate": (
            sum(b["exists"] for b in cited) / len(cited) if cited else 1.0
        ),
        # 摘录逐字率：quote 逐字出现在所引条文原文里的比例（防"摘录改写"）
        "quote_match_rate": (
            sum(b["quote_ok"] for b in cited if b["exists"])
            / max(1, sum(1 for b in cited if b["exists"]))
        ),
    }
    return {"summary": summary, "items": items}


if __name__ == "__main__":
    import sys
    from pathlib import Path

    if len(sys.argv) < 2:
        raise SystemExit("用法：python -m src.review path/to/contract.txt")
    txt = Path(sys.argv[1]).read_text(encoding="utf-8")
    report = review_contract(txt)
    print(json.dumps(report, ensure_ascii=False, indent=2))
