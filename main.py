"""FastAPI 入口：把现有 RAG 业务包成 HTTP 接口，给 Next.js 前端调用。

启动：
    uvicorn main:app --reload --port 8000
"""
import os
from pathlib import Path

# Streamlit 桥接：本地 .env 优先，Render 部署时用环境变量
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.qa import answer
from src.review import review_contract
from api.agent import router as agent_router

app = FastAPI(title="用工合规 AI Agent API", version="2.0")
app.include_router(agent_router)

# 前端 Next.js 跑在 localhost:3000 / 部署在 vercel.app，都要放开
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 比赛期间先全开，上线后收紧
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 模型 ----------
class QARequest(BaseModel):
    question: str
    history: list[dict] = []  # [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]


class QASource(BaseModel):
    law_name: str
    article_no: str
    text: str = ""


class QAResponse(BaseModel):
    answer: str
    sources: list[QASource]


class ReviewResponse(BaseModel):
    summary: dict
    items: list[dict]


# ---------- 路由 ----------
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "labor-ai-agent", "version": "2.0"}


@app.post("/api/qa", response_model=QAResponse)
def qa(req: QARequest):
    """劳动法问答（支持多轮历史）。"""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    result = answer(req.question, history=req.history)
    return QAResponse(
        answer=result["answer"],
        sources=[QASource(**{k: h.get(k, "") for k in ("law_name", "article_no", "text")})
                 for h in result["sources"]],
    )


@app.post("/api/review", response_model=ReviewResponse)
async def review(file: UploadFile = File(...)):
    """上传合同文件（txt/pdf/docx），返回风险清单。"""
    raw = await file.read()
    # 解码
    text = ""
    if file.filename and file.filename.lower().endswith(".pdf"):
        # PDF 用 pdfplumber（后面加依赖）
        try:
            import pdfplumber
            import io
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF 解析未安装，请 pip install pdfplumber")
    else:
        for enc in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue

    if len(text.strip()) < 30:
        raise HTTPException(status_code=400, detail="合同内容太短，无法审查")

    report = review_contract(text)
    return ReviewResponse(**report)


@app.post("/api/review_text", response_model=ReviewResponse)
async def review_text(body: dict):
    """直接粘贴合同正文审查（不走文件上传）。"""
    text = body.get("text", "")
    if len(text.strip()) < 30:
        raise HTTPException(status_code=400, detail="合同内容太短，无法审查")
    report = review_contract(text)
    return ReviewResponse(**report)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
