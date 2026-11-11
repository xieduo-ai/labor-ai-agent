"""所有模型调用统一收口：换供应商只改 .env，不动业务代码。"""
import time

import requests
from openai import OpenAI

import config

class _LazyClient:
    """延迟实例化 OpenAI 客户端。

    原先在模块导入时直接 OpenAI(...)，缺密钥会抛 OpenAIError，连带
    FastAPI 都起不来（静态页 / 计算器也一起挂）。改成首次真正调用时才建，
    这样无密钥环境下页面与纯规则的计算器仍可正常服务；有密钥时行为不变。
    变量名 _llm / _emb 保持不变，api/agent.py、src/vision.py 的
    `from src.llm import _llm` 无需改动。
    """

    def __init__(self, kind: str):
        self._kind = kind
        self._client = None

    def _get(self):
        if self._client is None:
            if self._kind == "llm":
                key, base = config.LLM_API_KEY, config.LLM_BASE_URL
                label = "LLM_API_KEY"
            else:
                key, base = config.EMBED_API_KEY, config.EMBED_BASE_URL
                label = "EMBED_API_KEY"
            if not key:
                raise RuntimeError(
                    f"缺少 {label}：法规问答、合同审查、劳动者助手需要模型密钥；"
                    "赔偿金计算器与静态页面不依赖密钥，仍可正常使用。"
                )
            self._client = OpenAI(api_key=key, base_url=base, timeout=120)
        return self._client

    def __getattr__(self, name):
        return getattr(self._get(), name)


_llm = _LazyClient("llm")
_emb = _LazyClient("emb")


def chat(messages, temperature=0.1, json_mode=False, retries=3):
    """调一次对话模型，返回纯文本。失败自动重试 3 次。"""
    last = None
    for i in range(retries):
        try:
            kwargs = {
                "model": config.LLM_MODEL,
                "messages": messages,
                "temperature": temperature,
            }
            if json_mode:
                # 注意：DeepSeek 要求 prompt 里出现 "json" 字样，prompts.py 已满足
                kwargs["response_format"] = {"type": "json_object"}
            resp = _llm.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 ** i)
    raise last


def embed(texts, batch_size=32):
    """把一批文本变成向量。批次小一点，避免触发接口限流。"""
    out = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        for attempt in range(3):
            try:
                resp = _emb.embeddings.create(model=config.EMBED_MODEL, input=batch)
                out.extend(d.embedding for d in resp.data)
                break
            except Exception:  # noqa: BLE001
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    return out


def rerank(query, docs, top_n=8):
    """Cross-Encoder 重排。失败就退回原顺序，不让整个流程崩掉。"""
    if not config.USE_RERANK or not docs:
        return [(i, None) for i in range(min(top_n, len(docs)))]
    try:
        resp = requests.post(
            config.EMBED_BASE_URL.rstrip("/") + "/rerank",
            headers={"Authorization": f"Bearer {config.EMBED_API_KEY}"},
            json={
                "model": config.RERANK_MODEL,
                "query": query,
                "documents": docs,
                "top_n": top_n,
                "return_documents": False,
            },
            timeout=60,
        )
        resp.raise_for_status()
        results = resp.json()["results"]
        return [(r["index"], r.get("relevance_score")) for r in results]
    except Exception as e:  # noqa: BLE001
        print(f"[rerank] 调用失败，退回 RRF 顺序：{e}")
        return [(i, None) for i in range(min(top_n, len(docs)))]
