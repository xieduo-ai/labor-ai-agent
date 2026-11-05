"""Agent 模式：用 LLM 做意图路由，把自然语言请求分发到不同工具。

演示效果：用户说"帮我看看这份合同有没有问题"，Agent 会输出思考链
（理解意图 → 选择工具 → 调用审查），而不是直接回答。
"""
import json

from fastapi import APIRouter
from pydantic import BaseModel

from src.llm import chat
from src.qa import answer
from src.review import review_contract

router = APIRouter(prefix="/api/agent", tags=["agent"])


AGENT_SYSTEM = """你是一个用工合规助手的调度中枢。根据用户的输入，判断要调用哪个工具。

只输出 JSON：
{
  "thought": "一句话说你为什么这么判断",
  "tool": "qa" | "review" | "calculator" | "clarify",
  "reply_to_user": "给用户的一句回应（告诉它你理解了什么、接下来要做什么）"
}

工具说明：
- qa：用户问劳动法相关问题（比如"试用期多久""被辞退怎么办"）
- review：用户要审查合同（比如"帮我看看这份合同""审查一下我传的合同"）
- calculator：用户问赔偿金额计算（比如"我能拿多少钱""2N怎么算"）
- clarify：信息不足，需要追问用户
"""


class AgentRequest(BaseModel):
    message: str
    contract_text: str = ""  # 如果用户已经传了合同，一并带来


class Step(BaseModel):
    step: str
    detail: str


@router.post("/run")
def run_agent(req: AgentRequest):
    # 第 1 步：让 LLM 做意图路由
    raw = chat(
        [
            {"role": "system", "content": AGENT_SYSTEM},
            {"role": "user", "content": req.message},
        ],
        json_mode=True,
        temperature=0,
    )
    try:
        decision = json.loads(raw)
    except json.JSONDecodeError:
        decision = {"thought": "解析失败，默认问答", "tool": "qa", "reply_to_user": "好的，我来帮你查。"}

    tool = decision.get("tool", "qa")
    steps = [
        {"step": "理解意图", "detail": decision.get("thought", "")},
        {"step": "选择工具", "detail": f"调用 → {tool}"},
    ]

    # 第 2 步：根据工具执行
    result = None
    if tool == "qa":
        steps.append({"step": "检索法条", "detail": "混合检索 + 重排中…"})
        result = answer(req.message)
        steps.append({"step": "生成回答", "detail": f"命中 {len(result['sources'])} 条法条"})
    elif tool == "review":
        if not req.contract_text:
            return {
                "steps": steps,
                "tool": "clarify",
                "reply": "请把合同正文贴给我，我帮你逐条审查风险。",
                "result": None,
            }
        steps.append({"step": "切分条款", "detail": "按「第X条」切分中…"})
        result = review_contract(req.contract_text)
        steps.append({"step": "逐条审查", "detail": f"审查了 {result['summary']['clauses']} 条条款"})
    elif tool == "calculator":
        steps.append({"step": "跳转计算器", "detail": "请前往赔偿金计算器页面"})
        return {
            "steps": steps,
            "tool": "calculator",
            "reply": "我帮你跳转到赔偿金计算器，输入月薪和工龄就能算。",
            "result": None,
        }
    else:
        return {
            "steps": steps,
            "tool": "clarify",
            "reply": decision.get("reply_to_user", "能再具体说说你的情况吗？"),
            "result": None,
        }

    return {
        "steps": steps,
        "tool": tool,
        "reply": decision.get("reply_to_user", ""),
        "result": result,
    }
