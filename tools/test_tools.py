"""验证硅基流动上的模型是否真的支持 OpenAI tools 协议。开发期脚本。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from src.llm import _llm
from src.tools import TOOL_SCHEMAS

candidates = [
    "deepseek-ai/DeepSeek-V3",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "Qwen/Qwen3-32B",
    "deepseek-ai/DeepSeek-V3.1",
]

msgs = [
    {"role": "system", "content": "你必须通过工具获取信息，不要凭记忆回答。"},
    {"role": "user", "content": "我干了3年，月薪8000，公司没理由辞退我，能拿多少赔偿金？请用 calc_compensation 算。"},
]

for m in candidates:
    try:
        r = _llm.chat.completions.create(
            model=m, messages=msgs, tools=TOOL_SCHEMAS, temperature=0
        )
        msg = r.choices[0].message
        tc = getattr(msg, "tool_calls", None)
        print(f"\n=== {m} ===")
        print("tool_calls:", "有" if tc else "无")
        if tc:
            for t in tc:
                print("  ->", t.function.name, t.function.arguments[:160])
        else:
            print("  content:", (msg.content or "")[:200])
    except Exception as e:
        print(f"\n=== {m} === 失败: {type(e).__name__}: {str(e)[:200]}")
