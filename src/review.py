"""合同审查：切条款 -> 逐条检索法条 -> 模型判风险 -> 汇总报告。

这一步是项目的差异点。市面上劳动法问答很多，但「上传合同、输出风险清单、每条带法条溯源」
的产品很少，因为它既需要工程又需要劳动法功底 —— 正好是你的组合。
"""
import json
import re

import config
from src.llm import chat
from src.prompts import REVIEW_SYSTEM
from src.retrieve import search

# 条款开头：第X条 / 一、 / 1. / （一）
CLAUSE_RE = re.compile(
    r"^\s*(第[一二三四五六七八九十百零]+条|[一二三四五六七八九十]+[、．.]|\d+[、．.]|（[一二三四五六七八九十]+）)"
)

_KEEP = {"高", "中", "低", "无"}


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


def _known_articles():
    """语料里真实存在的 (法律名, 条号)，用来校验模型有没有编法条。"""
    from src.retrieve import _load
    known = set()
    for ch in _load()["chunks"]:
        full = ch["law_name"]
        short = full.replace("中华人民共和国", "")
        known.add((full, ch["article_no"]))
        known.add((short, ch["article_no"]))
    return known


def _check_basis(data: dict, known: set) -> dict:
    basis = []
    for b in data.get("legal_basis") or []:
        law = str(b.get("law", "")).strip("《》 ")
        art = str(b.get("article", "")).strip()
        b["exists"] = (law, art) in known
        basis.append(b)
    data["legal_basis"] = basis
    data["basis_valid"] = all(b["exists"] for b in basis) if basis else None
    return data


def review_clause(clause: str, known: set, top_k: int = 4) -> dict:
    hits = search(clause, top_k=top_k)
    ctx = "\n\n".join(f"《{h['law_name']}》{h['article_no']}\n{h['text']}" for h in hits)
    messages = [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": f"参考资料：\n\n{ctx}\n\n待审查条款：\n{clause}"},
    ]
    raw = chat(messages, json_mode=True)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"risk_level": "未知", "risk_type": "其他", "issue": "模型输出无法解析",
                "legal_basis": [], "suggestion": ""}

    if data.get("risk_level") not in _KEEP:
        data["risk_level"] = "未知"
    data["clause"] = clause
    data["sources"] = [{"law_name": h["law_name"], "article_no": h["article_no"]} for h in hits]
    return _check_basis(data, known)


def review_contract(text: str, max_clauses: int = 25) -> dict:
    config.sanity_check()
    known = _known_articles()
    clauses = split_clauses(text)[:max_clauses]

    items = []
    for i, clause in enumerate(clauses, 1):
        print(f"[{i}/{len(clauses)}] 审查中 ...")
        items.append(review_clause(clause, known))

    order = {"高": 0, "中": 1, "低": 2, "无": 3, "未知": 4}
    items.sort(key=lambda r: order.get(r["risk_level"], 9))

    summary = {
        "clauses": len(items),
        "high": sum(r["risk_level"] == "高" for r in items),
        "mid": sum(r["risk_level"] == "中" for r in items),
        "low": sum(r["risk_level"] == "低" for r in items),
        "citation_valid_rate": (
            sum(1 for r in items if r.get("basis_valid")) / max(1, sum(1 for r in items if r["legal_basis"]))
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
