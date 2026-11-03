"""构建检索引擎：向量矩阵 + BM25 索引。

为什么不用向量数据库？
本项目语料只有几千条，numpy 矩阵暴力算余弦相似度只需几毫秒，
比装 Chroma/Milvus 更少踩坑。简历上写「混合检索 + RRF + 重排」比写
「用了 Chroma」更有含量；真要写向量库，第六周有余力再换。

用法：
    python -m src.index            # 首次构建
    python -m src.index --force    # 强制重建
"""
import json
import pickle
import sys

import jieba
import numpy as np

from src.tokenize import cut
from rank_bm25 import BM25Okapi
from tqdm import tqdm

import config
from src.llm import embed


def load_chunks():
    path = config.DATA_PROCESSED / "chunks.jsonl"
    if not path.exists():
        raise SystemExit("找不到 chunks.jsonl，请先运行：python -m src.ingest")
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def embed_text(c) -> str:
    """送给 embedding 的文本要带法律名和章，否则「第三十九条」这种条号毫无区分度。"""
    return f"《{c['law_name']}》{c['chapter']} {c['article_no']} {c['text']}"


def build(force: bool = False):
    config.sanity_check()
    chunks = load_chunks()
    emb_path = config.DATA_PROCESSED / "embeddings.npy"
    bm_path = config.DATA_PROCESSED / "bm25.pkl"

    if emb_path.exists() and bm_path.exists() and not force:
        print("索引已存在。要重建请加 --force")
        return

    texts = [embed_text(c) for c in chunks]
    print(f"共 {len(texts)} 条，开始向量化（首次约 2-5 分钟）...")

    vecs = []
    for i in tqdm(range(0, len(texts), 32), desc="embedding"):
        vecs.extend(embed(texts[i:i + 32]))

    arr = np.asarray(vecs, dtype="float32")
    arr /= np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9
    np.save(emb_path, arr)
    print(f"向量维度：{arr.shape}")

    print("构建 BM25 索引 ...")
    tokens = [cut(t) for t in tqdm(texts, desc="tokenize")]
    bm25 = BM25Okapi(tokens)
    with open(bm_path, "wb") as f:
        pickle.dump({"bm25": bm25, "chunks": chunks, "texts": texts}, f)

    print("完成。可以试：python -m src.qa \"试用期最长可以约定多久\"")


if __name__ == "__main__":
    build(force="--force" in sys.argv)
