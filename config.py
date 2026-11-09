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
# 默认值必须与 .env.example 一致。曾经默认值是 DeepSeek 官方地址 + deepseek-chat，
# 而生产用硅基流动：Railway 少配一个变量就直接回落，报 400 Model does not exist。
# 宁可默认就是实际在用的组合，也不要留一个「本地能跑、线上必崩」的隐式回落。
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.siliconflow.cn/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-ai/DeepSeek-V3")

# ---- 视觉模型（读合同照片/扫描件）----
# 与 LLM_MODEL 共用同一家服务商，默认走硅基流动的 Qwen3-VL（MoE，30B 激活 3B，约 10s/页）
LLM_VL_MODEL = os.getenv("LLM_VL_MODEL", "Qwen/Qwen3-VL-30B-A3B-Instruct")
VL_MAX_PAGES = int(os.getenv("VL_MAX_PAGES", "3"))   # 单个 PDF 最多识别几页
VL_MAX_SIDE = int(os.getenv("VL_MAX_SIDE", "1600"))  # 图片长边压缩上限（px）

# 语音识别：浏览器内置 SpeechRecognition 在 Chrome/Edge 上依赖 Google 在线服务，
# 国内网络必然返回 network 错误，因此改由服务端转发到同厂商的 ASR 模型。
ASR_MODEL = os.getenv("ASR_MODEL", "FunAudioLLM/SenseVoiceSmall")

# ---- Agent 专用模型 ----
# 实测：DeepSeek-V3 在硅基流动上不总是走 tool_calls 协议，会把调用写成正文里的 JSON
# （「假调用」，评审一眼能看穿）；V3.1 与 Qwen3-32B 稳定返回原生 tool_calls，
# 且 V3.1 在「先查法条再算金额」的多工具场景下遵循更一致。
# 长文本生成（审查/问答）仍用 LLM_MODEL。
AGENT_MODEL = os.getenv("AGENT_MODEL", "deepseek-ai/DeepSeek-V3.1")

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
