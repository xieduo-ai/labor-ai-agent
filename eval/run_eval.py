"""检索评测：算 Recall@5，导出明细表，用来做错误分析。

用法：
    python eval/run_eval.py                 # 用 eval/qa_set.jsonl
    python eval/run_eval.py eval/qa_set.jsonl

qa_set.jsonl 每行格式：
{"qid": 1, "question": "...", "gold_articles": ["中华人民共和国劳动合同法#第十九条"],
 "category": "试用期", "difficulty": "易"}
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

import config  # noqa: E402
from src.retrieve import search  # noqa: E402


def main(set_path: str | None = None, top_k: int = 5):
    path = Path(set_path) if set_path else config.EVAL_DIR / "qa_set.jsonl"
    rows = [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if not rows:
        raise SystemExit("评测集是空的")

    hit, detail = 0, []
    for r in rows:
        hits = search(r["question"], top_k=top_k)
        got = {(h["law_name"], h["article_no"]) for h in hits}
        gold = {tuple(g.split("#", 1)) for g in r["gold_articles"]}
        ok = bool(got & gold)
        hit += ok
        detail.append({
            "qid": r.get("qid"),
            "category": r.get("category", ""),
            "difficulty": r.get("difficulty", ""),
            "question": r["question"],
            f"hit@{top_k}": ok,
            "gold": " | ".join(r["gold_articles"]),
            "top1": f"{hits[0]['law_name']} {hits[0]['article_no']}" if hits else "",
        })

    print(f"\nRecall@{top_k} = {hit}/{len(rows)} = {hit / len(rows):.1%}")
    df = pd.DataFrame(detail)
    print("\n按类别：")
    print(df.groupby("category")[f"hit@{top_k}"].agg(["mean", "count"]).to_string())

    out = config.EVAL_DIR / "retrieval_result.csv"
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"\n明细已写入 {out}（用 Excel 打开，按 False 筛出失败样本）")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
