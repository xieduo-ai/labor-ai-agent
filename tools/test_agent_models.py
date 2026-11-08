"""对比模型在真实 Agent 场景下的 function calling 遵循度。开发期脚本。

判据：连续调用时是否稳定返回原生 tool_calls（而不是把调用写成文本 JSON）。
"""
import importlib
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

QUESTION = "我在公司干了3年，月薪8000，公司昨天突然说要辞退我，也没说理由。我能拿多少钱？"

model = sys.argv[1] if len(sys.argv) > 1 else "Qwen/Qwen3-32B"

import config
config.AGENT_MODEL = model

import api.agent as ag
importlib.reload(ag)

print(f"模型：{model}", flush=True)
for i in range(2):
    try:
        r = ag.run_agent(ag.AgentRequest(message=QUESTION))
        tools = r.get("tools_used") or []
        print(f"  第{i+1}次 tools={tools}", flush=True)
        if not tools:
            print(f"    回答开头：{(r.get('reply') or '')[:100]}", flush=True)
    except Exception as e:
        print(f"  第{i+1}次 异常: {type(e).__name__}: {str(e)[:100]}", flush=True)
