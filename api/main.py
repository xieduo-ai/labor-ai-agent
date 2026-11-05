"""FastAPI 薄封装：为 Next.js 前端提供合同审查（SSE 流式）与法规问答接口。

设计原则：
1. 不改动 src/ 任何现有代码——Streamlit（app.py）线上部署不受影响；
2. 审查走 SSE 逐条推送，前端可以边审边渲染（对应评分项「AI 交互体验」）；
3. summary 统计逻辑与 src/review.review_contract 保持一致（本地复制，避免动已验证代码）。

本地开发：
    uvicorn api.main:app --port 8000 --reload
前端（web/）通过 next.config 的 rewrites 代理到本服务，无需处理跨域。
"""
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import config
from src.qa import answer
from src.review import _clause_label, review_clause, split_clauses

app = FastAPI(title="用工合规 AI Agent", version="2.1.0")

# 本地开发时前端跑在 3000 端口（Next.js 默认），开发期放开，生产同域部署后收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------- 请求模型（TS 侧有对应的 interface） ----------

class ReviewIn(BaseModel):
    text: str = Field(..., min_length=15, max_length=60_000,
                      description="合同全文（纯文本）")


class QAIn(BaseModel):
    question: str = Field(..., min_length=2, max_length=500)


# ---------- 工具 ----------

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------- 接口 ----------

@app.get("/api/health")
def health():
    """前端启动时探测后端与索引是否就绪。"""
    return {"ok": True, "corpus": "14 部法规 / 678 条", "version": app.version}


@app.post("/api/qa")
def qa(inp: QAIn):
    """法规问答：答案 + 引用条文（非流式，与 Streamlit 版同一条链路）。"""
    return answer(inp.question)


@app.post("/api/review")
def review(inp: ReviewIn):
    """合同逐条审查：SSE 流式。

    事件序列：
      meta   -> {"clauses": N}                      条款总数
      clause -> {"index", "total", "items": [...]}   每审完一条推送
      done   -> {"summary": {...}}                   汇总指标
      error  -> {"message": "..."}                   任一条款失败时推送（不中断整体）
    """
    def gen():
        try:
            config.sanity_check()
        except Exception as e:  # 密钥缺失等启动级错误
            yield _sse("error", {"message": f"配置检查失败：{e}"})
            return

        clauses = split_clauses(inp.text)[:40]
        if not clauses:
            yield _sse("error", {"message": "未识别到有效条款：请确认文本为合同条款格式（第X条 / 一、 / 1.）"})
            return

        # 合同期限是试用期上限等判断的前置条件，逐条审查时作为背景注入
        contract_ctx = next(
            (c for c in clauses if "合同期限" in c or c.lstrip().startswith("第一条")), ""
        )

        yield _sse("meta", {"clauses": len(clauses)})

        all_items = []
        for i, clause in enumerate(clauses, 1):
            try:
                res = review_clause(clause, contract_ctx=contract_ctx)
                base = {
                    "clause": clause,
                    "clause_label": _clause_label(clause, i),
                    "sources": res["sources"],
                }
                if res["issues"]:
                    new = [{**base, **it} for it in res["issues"]]
                else:
                    new = [{**base, "risk_level": "无", "risk_type": "其他",
                            "issue": "未发现明显风险", "legal_basis": [],
                            "insufficient_basis": False, "suggestion": ""}]
                all_items.extend(new)
                yield _sse("clause", {"index": i, "total": len(clauses), "items": new})
            except Exception as e:  # 单条失败不拖垮整份审查
                yield _sse("error", {"message": f"第 {i} 条审查失败：{e}"})

        # 汇总口径与 src/review.review_contract 完全一致
        cited = [b for r in all_items for b in r["legal_basis"]]
        exists_n = sum(bool(b.get("exists")) for b in cited)
        summary = {
            "clauses": len(clauses),
            "issues": sum(r["risk_level"] in ("高", "中", "低") for r in all_items),
            "high": sum(r["risk_level"] == "高" for r in all_items),
            "mid": sum(r["risk_level"] == "中" for r in all_items),
            "low": sum(r["risk_level"] == "低" for r in all_items),
            "insufficient_basis": sum(bool(r.get("insufficient_basis")) for r in all_items),
            "citation_valid_rate": (exists_n / len(cited)) if cited else 1.0,
            "quote_match_rate": (
                sum(bool(b.get("quote_ok")) for b in cited if b.get("exists"))
                / max(1, exists_n)
            ),
        }
        yield _sse("done", {"summary": summary})

    return StreamingResponse(gen(), media_type="text/event-stream")
