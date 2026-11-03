"""混合检索：向量召回 + BM25 召回 -> RRF 融合 -> Cross-Encoder 重排。

为什么混合：
- 法律问题里大量精确术语（「代通知金」「经济补偿」「竞业限制」），BM25 打得准；
- 用户口语化提问（「公司让我走人不给钱」）向量检索才知道在问解除补偿。
- RRF 只用到排名、不用调权重，是新手最省事的融合方式。
"""
import pickle

import jieba
import numpy as np

import config
from src.llm import embed, rerank
from src.tokenize import cut

_CACHE = {}

# 口语 -> 法律术语 的查询扩展。
# 用户不会说「延长工作时间支付百分之一百五十的工资报酬」，只会说「一倍半」。
# 检索前把口语词展开成法条里的说法，BM25 和向量都能吃到，原句不动。
TERM_MAP = {
    "一倍半": "加班费 延长工作时间 百分之一百五十 工资报酬",
    "两倍工资": "二倍工资",
    "双倍工资": "二倍工资",
    "走人": "解除劳动合同",
    "让我走": "解除劳动合同",
    "开除": "解除劳动合同 违纪 规章制度",
    "辞退": "解除劳动合同 经济补偿",
    "被裁": "经济性裁员 解除劳动合同 经济补偿",
    "裁员": "经济性裁员",
    "调岗": "变更劳动合同 协商一致",
    "调到": "变更劳动合同 工作地点 协商一致",
    "调去": "变更劳动合同 工作地点 协商一致",
    "调外地": "变更劳动合同 工作地点 协商一致",
    "末位淘汰": "不能胜任工作 解除劳动合同",
    "生活费": "工资 最低工资标准",
    "离职": "解除劳动合同",
    "社保": "社会保险",
    "五险": "社会保险",
    "告他": "仲裁 诉讼",
    "产假": "生育 产假 女职工",
    "年假": "年休假",
}


def expand(query: str) -> str:
    """把口语问题补上法律术语，只在后面追加检索用词，不改原句。"""
    extra = [v for k, v in TERM_MAP.items() if k in query]
    if not extra:
        return query
    return query + " " + " ".join(extra)


def _load():
    if _CACHE:
        return _CACHE
    emb_path = config.DATA_PROCESSED / "embeddings.npy"
    bm_path = config.DATA_PROCESSED / "bm25.pkl"
    if not emb_path.exists() or not bm_path.exists():
        raise SystemExit("索引不存在，请先运行：python -m src.index")
    with open(bm_path, "rb") as f:
        pack = pickle.load(f)
    _CACHE["emb"] = np.load(emb_path)
    _CACHE["bm25"] = pack["bm25"]
    _CACHE["chunks"] = pack["chunks"]
    return _CACHE


def search(query: str, top_k: int = 6, recall_k: int = 20):
    """返回 top_k 条条文，每条含 law_name / article_no / text / score。"""
    c = _load()
    chunks, bm25 = c["chunks"], c["bm25"]
    recall_k = max(top_k, min(recall_k, len(chunks)))

    # 0) 查询扩展：口语 -> 法律术语（只用于召回，重排仍用原句）
    q = expand(query)

    # 1) 向量召回
    qv = np.asarray(embed([q])[0], dtype="float32")
    qv /= np.linalg.norm(qv) + 1e-9
    sims = c["emb"] @ qv
    vec_idx = np.argsort(-sims)[:recall_k].tolist()

    # 2) BM25 召回
    scores = bm25.get_scores(cut(q))
    bm_idx = np.argsort(-scores)[:recall_k].tolist()

    # 3) RRF 融合（k=60 是论文里的经验值）
    K = 60
    fused = {}
    for rank, i in enumerate(vec_idx):
        fused[i] = fused.get(i, 0.0) + 1.0 / (K + rank + 1)
    for rank, i in enumerate(bm_idx):
        fused[i] = fused.get(i, 0.0) + 1.0 / (K + rank + 1)
    cand = sorted(fused, key=lambda x: -fused[x])[:recall_k]

    # 4) 重排
    docs = [chunks[i]["text"] for i in cand]
    ranked = rerank(query, docs, top_n=min(top_k, len(cand)))

    out = []
    for pos, score in ranked:
        item = dict(chunks[cand[pos]])
        item["score"] = score
        out.append(item)
    return out


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) or "试用期最长可以约定多久"
    for r in search(q):
        print(f"[{r.get('score')}] 《{r['law_name']}》{r['article_no']}  {r['text'][:80]}")
