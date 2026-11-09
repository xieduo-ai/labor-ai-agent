"""消融实验：7 组检索配置在同一评测集上的 Recall@5。

这张表是项目里最值钱的一张表 —— 「我用了混合检索」只是陈述，
而「等权融合反而降到 52.5%、重排才是主力」才是工程判断。

七组与 `作品介绍文档.md` §3.3 / `技术文档.md` §4.5 的表格一一对应：
  ① 纯向量                         ④ 混合 + 重排（等权）
  ② 纯 BM25                        ⑤ 纯向量 + 重排
  ③ 混合 RRF（等权）               ③′ 混合 RRF（加权 0.8/0.2）
                                   ④′ 混合 + 重排（加权 0.8/0.2）← 线上配置

用法：
    python eval/ablate.py                       # 默认 40 题口语化集（正式截图用这个）
    python eval/ablate.py eval/qa_set.jsonl     # 指定评测集
    python eval/ablate.py --limit=10            # 快速自检前 10 题

实现说明：不动主检索管线（src/retrieve.py 里权重写死 0.8/0.2），
消融脚本自己按配置复刻「向量召回 → BM25 召回 → 加权 RRF → 重排」四步，
因此能真实构造线上跑不到的等权对照组；查询向量一次性批量算好，
40 题只发 2 次 embedding 请求。
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jieba  # noqa: E402
import numpy as np  # noqa: E402

# jieba 首次加载词典会打 4 行 INFO 日志，截图里占版面，静音掉
jieba.setLogLevel(logging.ERROR)

import config  # noqa: E402
from src.llm import embed, rerank  # noqa: E402
from src.retrieve import _load, expand  # noqa: E402
from src.tokenize import cut  # noqa: E402

TOP_K = 5
RECALL_K = 20
RRF_K = 60  # RRF 论文经验值，与主管线一致

# (名称, 候选来源, RRF 权重, 是否重排, 结论)
MODES: list[tuple[str, str, tuple[float, float] | None, bool, str]] = [
    ("① 纯向量", "vec", None, False, "基线"),
    ("② 纯 BM25", "bm", None, False, "口语提问几乎打不中"),
    ("③ 混合 RRF（等权）", "rrf", (0.5, 0.5), False, "比纯向量还低，弱信号灌进来"),
    ("④ 混合 + 重排（等权）", "rrf", (0.5, 0.5), True, "重排救回来了"),
    ("⑤ 纯向量 + 重排", "vec", None, True, "重排是主力"),
    ("③′ 混合 RRF（加权 0.8/0.2）", "rrf", (0.8, 0.2), False, "调权后不再拖后腿"),
    ("④′ 混合 + 重排（加权 0.8/0.2）", "rrf", (0.8, 0.2), True, "★ 当前线上配置"),
]


def pad(s: str, width: int) -> str:
    """按终端显示宽度补齐（中文/带圈序号算 2 列），保证表格对齐。"""
    w = sum(2 if (ord(c) > 0x2E80 or c in "①②③④⑤") else 1 for c in s)
    return s + " " * max(0, width - w)


def fused(vec_idx: list[int], bm_idx: list[int], vec_w: float, bm_w: float) -> list[int]:
    """加权 RRF：只用到排名，不依赖分数尺度。"""
    score: dict[int, float] = {}
    for rank, i in enumerate(vec_idx):
        score[i] = score.get(i, 0.0) + vec_w / (RRF_K + rank + 1)
    for rank, i in enumerate(bm_idx):
        score[i] = score.get(i, 0.0) + bm_w / (RRF_K + rank + 1)
    return sorted(score, key=lambda x: -score[x])[:RECALL_K]


def load_rows(argv: list[str]) -> tuple[Path, list[dict], int]:
    limit = 0
    rest: list[str] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--limit="):
            limit = int(a.split("=", 1)[1])
        elif a == "--limit" and i + 1 < len(argv):
            limit = int(argv[i + 1])
            i += 1
        elif not a.startswith("--"):
            rest.append(a)
        i += 1

    if rest:
        p = Path(rest[0])
        if not p.is_absolute():
            p = Path(__file__).resolve().parents[1] / p
    else:
        p = config.EVAL_DIR / "qa_set.hard.jsonl"
    rows = [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if limit:
        rows = rows[:limit]
    return p, rows, limit


def main() -> int:
    path, rows, limit = load_rows(sys.argv[1:])
    if not rows:
        raise SystemExit("评测集是空的")

    c = _load()
    chunks = c["chunks"]
    bm25 = c["bm25"]
    emb = c["emb"]

    # 消融必须让重排组真的重排；无重排组由脚本自己跳过 rerank，不受这个开关影响
    config.USE_RERANK = True

    queries = [r["question"] for r in rows]
    expanded = [expand(q) for q in queries]
    qvs = np.asarray(embed(expanded), dtype="float32")
    qvs /= np.linalg.norm(qvs, axis=1, keepdims=True) + 1e-9

    vec_rank = [np.argsort(-(emb @ qvs[i]))[:RECALL_K].tolist() for i in range(len(rows))]
    bm_rank = [np.argsort(-bm25.get_scores(cut(expanded[i])))[:RECALL_K].tolist()
               for i in range(len(rows))]

    hits = {name: 0 for name, *_ in MODES}
    rerank_cache: dict[tuple[str, tuple[int, ...]], list[tuple[int, float | None]]] = {}
    degraded = 0

    for i, row in enumerate(rows):
        gold = {tuple(g.split("#", 1)) for g in row["gold_articles"]}
        for name, source, weights, use_rerank, _ in MODES:
            if source == "vec":
                cand = vec_rank[i][:RECALL_K]
            elif source == "bm":
                cand = bm_rank[i][:RECALL_K]
            else:
                assert weights is not None
                cand = fused(vec_rank[i], bm_rank[i], weights[0], weights[1])

            if use_rerank:
                key = (queries[i], tuple(cand))
                if key not in rerank_cache:
                    docs = [chunks[j]["text"] for j in cand]
                    ranked = rerank(queries[i], docs, top_n=TOP_K)
                    # rerank 失败会退化成原顺序（score 全为 None），要显式暴露
                    if all(s is None for _, s in ranked):
                        degraded += 1
                    rerank_cache[key] = ranked
                picked = [cand[pos] for pos, _ in rerank_cache[key][:TOP_K]]
            else:
                picked = cand[:TOP_K]

            got = {(chunks[j]["law_name"], chunks[j]["article_no"]) for j in picked}
            if got & gold:
                hits[name] += 1
        if (i + 1) % 10 == 0:
            print(f"  … 已评完 {i + 1}/{len(rows)} 题", flush=True)

    n = len(rows)
    # 全角「─」占 2 列：39 个 ≈ 78 显示列，正好装进 80 列默认 PowerShell 窗口不折行。
    # 列宽 32+8+10=50，最长结论约 26 列，整行 ≈76 列，不会挤到换行。
    line = "─" * 39
    print()
    print(f"评测集 {path.name}（{n} 题）　指标 Recall@{TOP_K}　"
          f"向量 {config.EMBED_MODEL} / 重排 {config.RERANK_MODEL}")
    print(line)
    print(pad("方案", 32) + pad("命中", 8) + pad("Recall@5", 10) + "结论")
    print(line)
    for name, _, _, _, note in MODES:
        h = hits[name]
        print(pad(name, 32) + pad(f"{h}/{n}", 8) + pad(f"{h / n:.1%}", 10) + note)
    print(line)

    base = hits["① 纯向量"] / n
    equal = hits["③ 混合 RRF（等权）"] / n
    reranked = hits["⑤ 纯向量 + 重排"] / n
    online = hits["④′ 混合 + 重排（加权 0.8/0.2）"] / n
    print(f"结论 1｜重排贡献最大：纯向量 {base:.1%} → {reranked:.1%}"
          f"（{(reranked - base) * 100:+.1f} pt）")
    print(f"结论 2｜等权 RRF 有害：混合（等权）{equal:.1%} < 纯向量 {base:.1%}")
    print(f"结论 3｜加权后 BM25 无害但也无功劳：线上配置 {online:.1%}"
          f" 与「纯向量 + 重排」{reranked:.1%} 打平")
    if degraded:
        print(f"⚠️ 有 {degraded} 次重排调用失败并退化为原顺序，本次结果不可用于截图，请重跑。")
    print(line)
    if limit:
        print(f"⚠️ 本次只跑了前 {limit} 题（--limit），正式截图请去掉该参数跑全量 40 题。")
    else:
        print("复现命令：python eval/ablate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
