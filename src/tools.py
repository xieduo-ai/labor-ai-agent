"""Agent 可调用的工具：实现 + 给模型看的 schema，放在一起避免两边漂移。

每个工具都是普通函数，单独可测（`python -m src.tools` 会跑一遍自检）。
Agent 循环（api/agent.py）只负责「让模型决定调哪个、把结果喂回去」。

设计原则：
- 工具只做**能被验证**的事：检索返回真实法条、计算返回可复算的数字、
  审查返回带引用的结论。不做「猜用户意图」这类模型该做的事。
- 返回值一律是 JSON 可序列化的 dict，且控制体积（审查只回摘要不回全文），
  否则多轮循环会撑爆上下文窗口。
"""
import json
from typing import Any, Callable

from src.compensation import SCENARIOS, calc_compensation as _calc
from src.llm import chat
from src.qa import answer
from src.retrieve import search
from src.review import review_contract, split_clauses


# ---------- 工具实现 ----------

def search_law(query: str, top_k: int = 5) -> dict:
    """检索劳动法条文。返回条号 + 原文，供模型引用时逐字比对。"""
    hits = search(query, top_k=top_k)
    return {
        "count": len(hits),
        "articles": [
            {
                "law": h.get("law_name", ""),
                "article": h.get("article_no", ""),
                "text": (h.get("text", "") or "")[:400],
            }
            for h in hits
        ],
    }


def review_contract_tool(contract_text: str) -> dict:
    """逐条审查合同，只回摘要 + 高风险条款，不回全部细节（控制上下文体积）。"""
    text = (contract_text or "").strip()
    if len(text) < 30:
        return {"error": "合同内容太短，至少需要 30 字"}

    clauses = split_clauses(text)
    if len(clauses) > 40:
        return {"error": f"条款过多（{len(clauses)} 条），请分批审查"}

    result = review_contract(text)
    issues = result.get("issues", []) or []
    high = [
        {
            "clause_label": it.get("clause_label", ""),
            "risk_type": it.get("risk_type", ""),
            "issue": it.get("issue", ""),
            "legal_basis": [
                f"{b.get('law')}{b.get('article')}"
                for b in (it.get("legal_basis") or [])
                if b.get("exists")
            ],
        }
        for it in issues
        if it.get("risk_level") == "高"
    ]
    return {
        "summary": result.get("summary", {}),
        "high_risk": high[:8],
        "high_risk_truncated": len(high) > 8,
    }


def calc_compensation_tool(
    monthly_wage: float,
    work_years: float,
    scenario: str = "illegal",
    local_avg_wage: float | None = None,
) -> dict:
    """算经济补偿/赔偿金。规则见 src/compensation.py。"""
    try:
        return _calc(
            monthly_wage=float(monthly_wage),
            work_years=float(work_years),
            scenario=scenario,
            local_avg_wage=float(local_avg_wage) if local_avg_wage else None,
        )
    except (ValueError, TypeError) as e:
        return {"error": str(e), "scenarios": SCENARIOS}


DRAFT_PROMPT = """你是劳动争议文书助手。根据当事人陈述的事实，起草一份仲裁申请书。

要求：
1. 严格按格式：申请人信息（留占位）→ 被申请人信息（留占位）→ 仲裁请求 → 事实与理由 → 此致 XX劳动人事争议仲裁委员会
2. 仲裁请求必须具体、可执行（写明金额和计算方式）
3. **只能使用当事人明确说过的事实**。年份、月份、金额、岗位、公司性质这些要素，
   用户没说就用「（待补充：xxx）」占位，绝对不能自己推断或填一个看起来合理的值。
   例如用户只说「欠两个月工资」没说哪两个月，就写「（待补充：拖欠月份）」，
   不要写成「2024 年 1 月和 2 月」。
4. 引用法条时只引用你确信存在的条文，不确定就只写法律原则，不写条号
5. 用中文，正式书面语，不要 markdown 代码块，不要额外解释

只输出文书正文。"""


def draft_arbitration_letter(facts: str) -> dict:
    """根据事实描述生成劳动仲裁申请书草稿。"""
    facts = (facts or "").strip()
    if len(facts) < 10:
        return {"error": "请提供基本事实（入职时间、月薪、发生了什么）"}
    text = chat(
        [
            {"role": "system", "content": DRAFT_PROMPT},
            {"role": "user", "content": facts},
        ],
        temperature=0,
    )
    return {
        "document": text,
        "note": "这是草稿，金额与事实需当事人自行核对；正式提交前建议咨询当地法律援助。",
    }


# ---------- 给模型看的 schema（OpenAI function calling 格式）----------

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_law",
            "description": "检索中国劳动法条文。凡是需要引用具体法条、条号、原文时，必须先调用它，"
                           "不要凭记忆写法条内容。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "检索词，如「试用期上限」「违法解除赔偿」"},
                    "top_k": {"type": "integer", "description": "返回条数，默认 5，最多 10"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_contract",
            "description": "逐条审查劳动合同，返回风险汇总和高风险条款清单。"
                           "用户提供合同全文、要求审查合同时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "contract_text": {"type": "string", "description": "合同全文，需包含条款编号"},
                },
                "required": ["contract_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calc_compensation",
            "description": "计算经济补偿金（N）、赔偿金（2N）或 N+1。"
                           "涉及具体金额时必须调用，不要口算。",
            "parameters": {
                "type": "object",
                "properties": {
                    "monthly_wage": {"type": "number", "description": "离职前 12 个月平均月薪（元）"},
                    "work_years": {"type": "number", "description": "在本单位工作年限（年，可带小数如 3.5）"},
                    "scenario": {
                        "type": "string",
                        "enum": list(SCENARIOS),
                        "description": "illegal=违法解除(2N)；normal=协商/裁员(N)；"
                                       "no_fault=未提前30天通知(N+1)；expire=合同到期不续签(N)",
                    },
                    "local_avg_wage": {
                        "type": "number",
                        "description": "当地上年度职工月平均工资，用于三倍封顶校验。用户没提就省略",
                    },
                },
                "required": ["monthly_wage", "work_years", "scenario"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_arbitration_letter",
            "description": "起草劳动仲裁申请书。用户明确要求写申请书、仲裁材料时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "facts": {
                        "type": "string",
                        "description": "当事人原话里的事实。只写用户明确说过的内容："
                                       "入职时间、岗位、月薪、发生了什么、诉求。"
                                       "用户没提的月份、金额、公司名一律写「（待补充）」，"
                                       "绝对不要推断或补一个看起来合理的值。",
                    },
                },
                "required": ["facts"],
            },
        },
    },
]

# name -> 可调用对象。Agent 循环按模型返回的 name 查表
TOOL_IMPL: dict[str, Callable[..., dict]] = {
    "search_law": search_law,
    "review_contract": review_contract_tool,
    "calc_compensation": calc_compensation_tool,
    "draft_arbitration_letter": draft_arbitration_letter,
}

# 中文标签，前端渲染步骤时显示
TOOL_LABELS = {
    "search_law": "检索法条",
    "review_contract": "审查合同",
    "calc_compensation": "计算赔偿金",
    "draft_arbitration_letter": "起草仲裁申请书",
}


def call_tool(name: str, args: dict[str, Any]) -> dict:
    """按名字执行工具，异常统一转成 {"error": ...}，不让 Agent 循环崩掉。"""
    fn = TOOL_IMPL.get(name)
    if not fn:
        return {"error": f"未知工具：{name}"}
    try:
        return fn(**args)
    except TypeError as e:
        return {"error": f"参数不匹配：{e}"}
    except Exception as e:  # noqa: BLE001
        return {"error": f"工具执行失败：{e}"}


# ---------- 自检 ----------

if __name__ == "__main__":
    print("== calc 3年 8000 违法解除 ==")
    print(json.dumps(calc_compensation_tool(8000, 3, "illegal"), ensure_ascii=False, indent=2))
    print("== calc 3.5年 8000 N+1 ==")
    r = calc_compensation_tool(8000, 3.5, "no_fault")
    print(r["formula"], "=", r["amount"])
    print("== calc 封顶校验（月薪5万，社平1万→三倍3万）==")
    r = calc_compensation_tool(50000, 15, "normal", local_avg_wage=10000)
    print(r["formula"], "=", r["amount"], "capped:", r["capped"], "n:", r["n_months"])
    print("== search_law 试用期 ==")
    s = search_law("试用期最长可以约定多久", top_k=3)
    for a in s["articles"]:
        print(" ", a["law"], a["article"])
