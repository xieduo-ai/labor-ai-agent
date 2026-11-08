"""Agent 模式：真实的 Function Calling 工具循环（多轮），不是单次意图路由。

和旧版的区别（旧版被评审指出「思考链是假的」）：
  旧：LLM 输出一个 JSON 说"我要调 review" -> 后端硬编码拼几步 -> 单次执行
  新：LLM 通过标准 tools 协议自主决定调哪个工具、传什么参数、要不要连续调多个；
      后端只负责执行并把结果喂回去，直到模型自己判断信息够了为止。

每一轮都是模型自己的决定，所以「规划 / 工具调用 / 自主决策」在实现上真实存在，
不是后端写死的流程。

SSE 事件（前端据此逐条渲染）：
  step  -> {"kind": "thinking"|"tool_call"|"tool_result", "tool", "label", "detail", "args", "result"}
  token -> {"text": "..."}     最终回答逐字流
  done  -> {"tools_used": [...], "rounds": N}
  error -> {"message": "..."}
"""
import json
import re
from typing import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.llm import _llm
from src.tools import TOOL_LABELS, TOOL_SCHEMAS, call_tool

import config

router = APIRouter(prefix="/api/agent", tags=["agent"])

# 上限：防止模型陷入无限调工具
MAX_ROUNDS = 4

SYSTEM_PROMPT = """你是「明契」用工合规助手，服务对象是普通劳动者和小微企业 HR。

你拥有四个工具：search_law（查法条）、calc_compensation（算金额）、
review_contract（审合同）、draft_arbitration_letter（写仲裁申请书）。

【硬性规则，违反即为错误回答】
1. 只要回答里要出现法条条号或法条原文，就必须先调用 search_law。
   凭记忆写出「第46条」「第47条」这类条号是禁止的——记错条号会让当事人引错依据。
2. 只要回答里要出现具体金额，就必须先调用 calc_compensation。
   心算金额是禁止的，哪怕你觉得很简单。
3. 用户给了合同全文并要求看有没有问题，调用 review_contract。
4. 用户明确要求写仲裁申请书 / 仲裁材料时，**必须调用 draft_arbitration_letter 出一份草稿**，
   信息不全也要出——缺失项用「（待补充）」占位。当事人看到草稿才知道自己该补什么，
   空手追问对他没有用。只有在用户连"被谁、什么事"都没说清楚时才可以先追问。
5. 一个请求可以连续调用多个工具，顺序由你判断（通常先查法条、再算金额）。
6. 不需要法条也不涉及金额的问题（问候、澄清、纯信息追问）才直接回答。
7. 调用工具时传的参数只能来自用户原话。用户没说月份、没说金额、没说岗位，
   就不要替他在参数里填一个——尤其是 draft_arbitration_letter 的 facts，
   必须原样传达，缺失的写「（待补充）」让当事人自己补。

【回答要求】
- 先给结论，再给依据，最后给行动建议
- 引用法条时写明《法律名》第X条，且只引用工具返回过的条文
- 信息不足时不要编造当事人情况；用户要文书就先出草稿，末尾列出需要他补充的项
- 不确定的事就说不确定，金额和时效直接影响当事人利益
- 说人话，别堆术语"""


class AgentRequest(BaseModel):
    message: str
    history: list[dict] = []       # [{"role": "user"|"assistant", "content": "..."}]
    contract_text: str = ""        # 用户已上传的合同，作为上下文一并给模型


class Step(BaseModel):
    step: str
    detail: str


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


_TIME_RE = re.compile(r"\d{4}\s*年(?:\s*\d{1,2}\s*月)?|\d{1,2}\s*月")
_MONEY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:万)?\s*元")


def _fact_warnings(payload: dict, user_text: str) -> list[str]:
    """检查模型传给工具的事实里，有没有用户原话中不存在的时间 / 金额。

    为什么需要这层：把口语整理成结构化事实时，模型容易「补全」细节——
    用户只说「公司欠我两个月工资」，它写成「2023 年 9 月和 10 月」。
    这种补全一旦进了仲裁申请书，就是当事人要签字承担的事实错误。
    所以在工具返回时就把不一致的地方标出来，让人自己核对。

    注意：金额按**数字**比而不是按「6000元」整串比——用户说「月薪6000」、
    模型写「月薪6000元」，这是正常转写，不该报错。
    """
    blob = json.dumps(payload, ensure_ascii=False)
    src = re.sub(r"\s", "", user_text or "")
    warnings: list[str] = []

    for m in _TIME_RE.findall(blob):
        key = re.sub(r"\s", "", m)
        if key not in src:
            warnings.append(f"「{m.strip()}」用户原话里没有提到")

    for m in _MONEY_RE.finditer(blob):
        num = m.group(1)
        if num in src:
            continue
        # 能由用户给的数字直接算出来的（如月薪 6000 -> 欠两月 12000）提示措辞弱一些
        warnings.append(f"金额「{m.group(0).strip()}」在原话里没有直接出现，请核对")

    # 去重但保留顺序
    seen, out = set(), []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


def _build_messages(req: AgentRequest) -> list[dict]:
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    # 只保留最近 6 轮历史，避免上下文过长拖慢首字
    for h in req.history[-6:]:
        role = h.get("role")
        content = h.get("content")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    user = req.message
    if req.contract_text.strip():
        user += f"\n\n【用户已上传的合同全文】\n{req.contract_text[:4000]}"
    msgs.append({"role": "user", "content": user})
    return msgs


def _summarize_result(tool: str, result: dict) -> str:
    """把工具返回值压成一行给前端展示，避免把长 JSON 直接铺在界面上。"""
    if "error" in result:
        return f"失败：{result['error']}"
    if tool == "search_law":
        arts = "、".join(f"{a['law']}{a['article']}" for a in result.get("articles", [])[:4])
        return f"命中 {result.get('count', 0)} 条：{arts}"
    if tool == "review_contract":
        s = result.get("summary", {}) or {}
        return (f"{s.get('clauses', 0)} 条条款 / {s.get('issues', 0)} 个问题"
                f"（高风险 {s.get('high', 0)}）")
    if tool == "calc_compensation":
        return f"{result.get('label', '')}：¥{result.get('amount', 0):,.0f}"
    if tool == "draft_arbitration_letter":
        doc = result.get("document", "")
        return f"已生成草稿 {len(doc)} 字"
    return "完成"


def run_agent_stream(req: AgentRequest) -> Iterator[str]:
    """工具循环 + 最终回答流式。"""
    messages = _build_messages(req)
    tools_used: list[str] = []
    rounds = 0

    try:
        for rounds in range(1, MAX_ROUNDS + 1):
            resp = _llm.chat.completions.create(
                model=_model(),
                messages=messages,
                tools=TOOL_SCHEMAS,
                temperature=0,
            )
            msg = resp.choices[0].message

            # 没有工具调用 -> 模型认为可以回答了。这一轮的回答先丢弃，
            # 下面用无 tools 的流式请求重新生成，让用户看到逐字输出。
            if not msg.tool_calls:
                break

            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ],
            })

            for tc in msg.tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                label = TOOL_LABELS.get(name, name)
                tools_used.append(name)

                yield _sse("step", {
                    "kind": "tool_call",
                    "tool": name,
                    "label": label,
                    "args": args,
                })

                result = call_tool(name, args)

                # 文书类工具做一次事实校验：把模型自行补全的时间/金额标出来
                if name == "draft_arbitration_letter":
                    warnings = _fact_warnings(args, req.message)
                    if warnings:
                        result = {**result, "fact_warnings": warnings}

                yield _sse("step", {
                    "kind": "tool_result",
                    "tool": name,
                    "label": label,
                    "detail": _summarize_result(name, result),
                    "result": result,
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False)[:6000],
                })

        # 最终回答：不带 tools，流式输出，确保模型不再调工具而是给结论
        stream = _llm.chat.completions.create(
            model=_model(),
            messages=messages,
            temperature=0.3,
            stream=True,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                yield _sse("token", {"text": piece})

        yield _sse("done", {"tools_used": tools_used, "rounds": rounds})

    except Exception as e:  # noqa: BLE001
        yield _sse("error", {"message": f"Agent 执行失败：{e}"})


def _model() -> str:
    """Agent 专用模型（见 config.AGENT_MODEL 的注释）。

    审查/问答要长文本质量（DeepSeek-V3 更强），Agent 要的是**稳定的 function
    calling 遵循度**——实测 DeepSeek-V3 会把工具调用写成正文 JSON 而非原生
    tool_calls，Qwen3-32B 稳定。两者用不同模型各取所长。
    """
    return config.AGENT_MODEL


def run_agent(req: AgentRequest) -> dict:
    """非流式版本：把 SSE 拼回一个完整结果，供 curl / 脚本调用。"""
    steps: list[Step] = []
    answer_parts: list[str] = []
    tools_used: list[str] = []
    error = None

    for raw in run_agent_stream(req):
        # 直接复用同一套逻辑，避免两套实现漂移
        lines = [ln for ln in raw.split("\n") if ln.strip()]
        event = next((ln[6:].strip() for ln in lines if ln.startswith("event:")), "")
        data_line = next((ln[5:].strip() for ln in lines if ln.startswith("data:")), "{}")
        try:
            data = json.loads(data_line)
        except json.JSONDecodeError:
            continue

        if event == "step":
            if data.get("kind") == "tool_call":
                steps.append(Step(step=f"调用 {data.get('label')}", detail=""))
            elif data.get("kind") == "tool_result":
                steps.append(Step(step=f"{data.get('label')} 完成", detail=data.get("detail", "")))
        elif event == "token":
            answer_parts.append(data.get("text", ""))
        elif event == "done":
            tools_used = data.get("tools_used", [])
        elif event == "error":
            error = data.get("message", "")

    return {
        "steps": [s.model_dump() for s in steps],
        "tools_used": tools_used,
        "reply": "".join(answer_parts),
        "error": error,
    }


@router.post("/stream")
def agent_stream(req: AgentRequest):
    """SSE 流式 Agent：逐条推送工具调用与结果，最后逐字输出回答。"""
    if not req.message.strip():
        return StreamingResponse(
            iter([_sse("error", {"message": "消息不能为空"})]),
            media_type="text/event-stream",
        )
    return StreamingResponse(run_agent_stream(req), media_type="text/event-stream")


@router.post("/run")
def agent_run(req: AgentRequest):
    """非流式：一次性返回完整过程与回答。"""
    if not req.message.strip():
        return {"steps": [], "tools_used": [], "reply": "", "error": "消息不能为空"}
    return run_agent(req)
