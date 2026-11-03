"""消融实验：对比四种检索方式在同一评测集上的 Recall@k。

这是简历上最值钱的一张表 —— 「混合检索让 Recall@5 从 62% 提到 84%」比
「我用了 RAG」有说服力得多。

用法：
    python eval/ablate.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jieba  # noqa: E402
import numpy as np  # noqa: E402

import config  # noqa: E402
from src.llm import embed  # noqa: E402
from src.retrieve import _load, search  # noqa: E402


def vec_only(q, k=5):
    c = _load()
    qv = np.asarray(embed([q])[0], dtype="float32")
    qv /= np.linalg.norm(qv) + 1e-9
    idx = np.argsort(-(c["emb"] @ qv))[:k]
    return [c["chunks"][i] for i in idx]


def bm25_only(q, k=5):
    c = _load()
    scores = c["bm25"].get_scores(list(jieba.cut(q)))
    idx = np.argsort(-scores)[:k]
    return [c["chunks"][i] for i in idx]


def hybrid_norerank(q, k=5):
    old = config.USE_RERANK
    config.USE_RERANK = False
    try:
        return search(q, top_k=k)
    finally:
        config.USE_RERANK = old


def hybrid_rerank(q, k=5):
    return search(q, top_k=k)


def main(k=5):
    path = config.EVAL_DIR / "qa_set.jsonl"
    rows = [json.loads(ln) for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]

    modes = {
        "① 纯向量": vec_only,
        "② 纯 BM25": bm25_only,
        "③ 混合 RRF": hybrid_norerank,
        "④ 混合 + 重排": hybrid_rerank,
    }

    print(f"评测集 {len(rows)} 题，指标 Recall@{k}\n")
    for name, fn in modes.items():
        hit = 0
        for r in rows:
            got = {(h["law_name"], h["article_no"]) for h in fn(r["question"], k)}
            gold = {tuple(g.split("#", 1)) for g in r["gold_articles"]}
            hit += bool(got & gold)
        print(f"  {name:<14} {hit / len(rows):>6.1%}")


if __name__ == "__main__":
    main()
