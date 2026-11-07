"""列出当前 key 可用的模型，筛出可能的多模态模型。"""
import os
import sys

from openai import OpenAI

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402

client = OpenAI(api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL, timeout=60)
models = client.models.list().data
ids = sorted(m.id for m in models)
print(f"共 {len(ids)} 个模型")

keywords = ("vl", "vision", "multimodal", "glm-4v", "qvq", "omni", "image")
hits = [i for i in ids if any(k in i.lower() for k in keywords)]
print("\n=== 疑似多模态 ===")
print("\n".join(hits) if hits else "（无）")

print("\n=== 全部可用（前 60） ===")
print("\n".join(ids[:60]))
