"""FastAPI 唯一后端入口：Streamlit 版（app.py）之外的 HTTP 服务，给 Next.js 前端调用。

本地开发：
    uvicorn main:app --reload --port 8000
生产（Railway 等，容器见 Dockerfile）：
    uvicorn main:app --host 0.0.0.0 --port $PORT

接口一览：
    GET  /api/health       探活
    POST /api/qa           法规问答（带多轮历史，JSON）
    POST /api/calc         经济补偿/赔偿金计算（规则见 src/compensation.py）
    POST /api/review       合同文件上传（txt/pdf/图片），按内容自动路由，SSE 流式
    POST /api/review_image 合同照片 / 扫描版 PDF（多模态识别后审查），SSE 流式
    POST /api/review_text  合同正文粘贴（JSON），SSE 流式审查
    POST /api/agent/stream Agent 工具循环（SSE：工具调用过程 + 逐字回答）
    POST /api/agent/run    Agent 非流式版本（脚本调用用）
    POST /api/transcribe   语音录音转文字（服务端 ASR，返回 JSON）
"""
import io
import os
from pathlib import Path

import requests

# 本地 .env 优先，云上用平台注入的环境变量
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

# 必须放在 load_dotenv() 之后：config.py 在模块导入时就读取 os.getenv，
# 提前导入会导致本地 .env 里的密钥读不到（线上由平台注入则不受影响）
import config

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.agent import router as agent_router
from api.review_stream import stream_review, stream_vision_review
from src.compensation import calc_compensation
from src.qa import answer
from src.domain_guard import classify, out_of_domain_reply

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
    in_domain: bool = True
    topic: str = ""
    notice: str = ""


class ReviewTextRequest(BaseModel):
    text: str


class CalcRequest(BaseModel):
    monthly_wage: float
    work_years: float = 0.0
    scenario: str = "illegal"
    local_avg_wage: float | None = None
    # 专项索赔类可选参数
    advance_notice: bool = False
    unsigned_months: float = 11.0
    leave_days: float = 0.0
    hrs_normal: float = 0.0
    hrs_rest: float = 0.0
    hrs_legal: float = 0.0
    injury_grade: int = 10


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
    """劳动法问答（支持多轮历史）。领域前置判定与 /api/agent/stream 一致：
    越界直接短路返回固定边界说明，不检索法条、不调模型、不生成类案。"""
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    verdict = classify(req.question)
    if not verdict.in_domain:
        return QAResponse(
            answer=out_of_domain_reply(verdict),
            sources=[],
            in_domain=False,
            topic=verdict.topic,
            notice=verdict.notice,
        )
    result = answer(req.question, history=req.history)
    return QAResponse(
        answer=result["answer"],
        sources=[QASource(**{k: h.get(k, "") for k in ("law_name", "article_no", "text")})
                 for h in result["sources"]],
        in_domain=True,
    )


@app.post("/api/calc")
def calc(req: CalcRequest):
    """经济补偿/赔偿金计算。

    规则唯一实现放在 src/compensation.py，前端计算器页和 Agent 的
    calc_compensation 工具都走这里，避免同一套法条口径写两遍。
    """
    try:
        return calc_compensation(
            monthly_wage=req.monthly_wage,
            work_years=req.work_years,
            scenario=req.scenario,
            local_avg_wage=req.local_avg_wage,
            advance_notice=req.advance_notice,
            unsigned_months=req.unsigned_months,
            leave_days=req.leave_days,
            hrs_normal=req.hrs_normal,
            hrs_rest=req.hrs_rest,
            hrs_legal=req.hrs_legal,
            injury_grade=req.injury_grade,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


# 语音输入上限：15 秒 16kHz 单声道 WAV 约 0.5MB，留足余量
MAX_AUDIO = 10 * 1024 * 1024


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """语音录音转文字：转发到硅基流动 ASR，返回 {"text": "..."}。

    为什么不直接用浏览器 SpeechRecognition：Chrome / Edge 的实现依赖 Google 在线
    识别服务，国内网络稳定返回 network 错误，功能等于不可用。改为前端 Web Audio
    直接采 PCM 编 WAV、这里转发到同厂商的 SenseVoiceSmall；识别文本回显到
    输入框供用户核对后才进入既有 RAG / Agent 管线，和图片识别一样是
    「转文本 → 复用已评测管线」，不引入新的不可核验环节。

    隐私：音频只转发、不落盘、不存储、不写日志。
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="录音为空")
    if len(raw) > MAX_AUDIO:
        raise HTTPException(status_code=413, detail="录音超过 10MB，请说短一点")

    key = config.LLM_API_KEY or config.EMBED_API_KEY
    if not key:
        raise HTTPException(status_code=503, detail="语音识别未配置")

    url = config.LLM_BASE_URL.rstrip("/") + "/audio/transcriptions"
    try:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {key}"},
            files={
                "file": (
                    file.filename or "audio.wav",
                    raw,
                    file.content_type or "audio/wav",
                )
            },
            data={"model": config.ASR_MODEL},
            timeout=60,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"语音服务连接失败：{type(e).__name__}")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"语音识别失败（{r.status_code}）")
    try:
        text = (r.json() or {}).get("text", "").strip()
    except ValueError:
        raise HTTPException(status_code=502, detail="语音识别返回格式异常")
    return {"text": text}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
