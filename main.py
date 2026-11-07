"""FastAPI 唯一后端入口：Streamlit 版（app.py）之外的 HTTP 服务，给 Next.js 前端调用。

本地开发：
    uvicorn main:app --reload --port 8000
生产（Railway 等，容器见 Dockerfile）：
    uvicorn main:app --host 0.0.0.0 --port $PORT

接口一览：
    GET  /api/health       探活
    POST /api/qa           法规问答（带多轮历史，JSON）
    POST /api/review       合同文件上传（txt/pdf），SSE 流式审查
    POST /api/review_image 合同照片 / 扫描版 PDF（多模态识别后审查），SSE 流式
    POST /api/review_text  合同正文粘贴（JSON），SSE 流式审查
    POST /api/agent/run    Agent 意图路由（见 api/agent.py）
"""
import io
import os
from pathlib import Path

# 本地 .env 优先，云上用平台注入的环境变量
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.agent import router as agent_router
from api.review_stream import stream_review, stream_vision_review
from src.qa import answer

app = FastAPI(title="用工合规 AI Agent API", version="2.2.0")
app.include_router(agent_router)

# 前端与后端分属两个域名（如 Railway 上两个服务），比赛期间先放开，上线后收紧到具体域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 请求/响应模型 ----------

class QARequest(BaseModel):
    question: str
    history: list[dict] = []  # [{"role":"user","content":"..."}, ...]


class QASource(BaseModel):
    law_name: str
    article_no: str
    text: str = ""


class QAResponse(BaseModel):
    answer: str
    sources: list[QASource]


class ReviewTextRequest(BaseModel):
    text: str


# ---------- 工具 ----------

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff")


def _is_image(filename: str) -> bool:
    return filename.lower().endswith(IMAGE_EXTS)


def _decode_upload(raw: bytes, filename: str) -> str:
    """上传文件 -> 纯文本。txt 按常见中文编码尝试，PDF 用 pdfplumber 抽取。

    扫描版 PDF 没有文字层，pdfplumber 返回空串，由调用方回退到视觉识别。
    """
    if filename.lower().endswith(".pdf"):
        try:
            import pdfplumber
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF 解析未安装（pdfplumber）")
        try:
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                return "\n".join((p.extract_text() or "") for p in pdf.pages)
        except Exception:  # 损坏/加密 PDF 不直接 500，交给视觉通道再试一次
            return ""

    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail="无法识别文件编码（支持 utf-8 / gb18030）")


# ---------- 接口 ----------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "labor-ai-agent", "version": app.version}


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


@app.post("/api/review")
async def review(file: UploadFile = File(...)):
    """上传合同文件（txt/pdf/图片），SSE 流式返回逐条审查结果。

    统一入口，按文件内容路由三条路径：
      txt / 有文字层的 PDF -> 直接抽文字进审查管线
      扫描版 PDF（文字层为空）-> 回退到视觉识别
      图片（手机拍照）-> 视觉识别
    这样前端只用一个上传框，用户不用关心自己传的是哪种。
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    name = file.filename or ""

    if _is_image(name):
        return StreamingResponse(stream_vision_review(raw, name), media_type="text/event-stream")

    text = _decode_upload(raw, name)
    if len(text.strip()) < 30:
        # 扫描件：pdfplumber 抽不到字，走视觉通道（多一个 extract 事件回显原文）
        if name.lower().endswith(".pdf"):
            return StreamingResponse(
                stream_vision_review(raw, name), media_type="text/event-stream"
            )
        raise HTTPException(status_code=400, detail="合同内容太短，无法审查")
    return StreamingResponse(stream_review(text), media_type="text/event-stream")


@app.post("/api/review_text")
async def review_text(req: ReviewTextRequest):
    """粘贴合同正文（JSON），SSE 流式返回逐条审查结果。"""
    if len(req.text.strip()) < 30:
        raise HTTPException(status_code=400, detail="合同内容太短，无法审查")
    return StreamingResponse(stream_review(req.text), media_type="text/event-stream")


MAX_UPLOAD = 10 * 1024 * 1024  # 10MB，手机拍照一般 2-5MB


@app.post("/api/review_image")
async def review_image(file: UploadFile = File(...)):
    """合同照片 / 扫描版 PDF：先识别文字，再逐条流式审查。

    事件序列比 /api/review 多两个：extract_start（开始识别）、extract（识别出的原文）。
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="文件超过 10MB，请压缩后再上传")
    return StreamingResponse(
        stream_vision_review(raw, file.filename or "upload.jpg"),
        media_type="text/event-stream",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
