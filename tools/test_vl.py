"""测试硅基流动上的视觉模型能否读中文合同图片。"""
import base64
import os
import sys
import time

from openai import OpenAI

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402

CANDIDATES = [
    "Qwen/Qwen3-VL-32B-Instruct",
    "Qwen/Qwen3-VL-30B-A3B-Instruct",
    "Qwen/Qwen3-VL-8B-Instruct",
    "PaddlePaddle/PaddleOCR-VL-1.5",
]

img_path = os.environ.get("TEMP", ".") + "/test_contract.jpg"
b64 = base64.b64encode(open(img_path, "rb").read()).decode()

client = OpenAI(api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL, timeout=180)

for model in CANDIDATES:
    t0 = time.time()
    try:
        r = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "把这张图片里的合同文字完整提取出来，保留换行和条号，不要解释。"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
            temperature=0,
            max_tokens=800,
        )
        print(f"[OK] {model}  {time.time()-t0:.1f}s")
        print(r.choices[0].message.content[:700])
        print("-" * 60)
    except Exception as e:  # noqa: BLE001
        print(f"[FAIL] {model}: {str(e)[:160]}")
