"""全局配置。所有路径、模型名、密钥都从这里取，不要在别的文件里写死。"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

# ---- 目录 ----
DATA_RAW = ROOT / "data" / "raw"            # 原始法规 txt
DATA_PROCESSED = ROOT / "data" / "processed"  # 切分后的 chunks / 向量 / BM25
EVAL_DIR = ROOT / "eval"
for _d in (DATA_RAW, DATA_PROCESSED, EVAL_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---- 生成模型 ----
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

# ---- 向量 / 重排 ----
EMBED_API_KEY = os.getenv("EMBED_API_KEY", "")
EMBED_BASE_URL = os.getenv("EMBED_BASE_URL", "https://api.siliconflow.cn/v1")
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-m3")
RERANK_MODEL = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
USE_RERANK = os.getenv("USE_RERANK", "1") == "1"


def sanity_check() -> None:
    """启动时自检，报错比跑到一半失败好。"""
    missing = []
    if not LLM_API_KEY:
        missing.append("LLM_API_KEY")
    if not EMBED_API_KEY:
        missing.append("EMBED_API_KEY")
    if missing:
        raise SystemExit(f"缺少配置：{', '.join(missing)}。请复制 .env.example 为 .env 并填写。")
