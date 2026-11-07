"""多模态入口：把合同照片 / 扫描件 PDF 变成可审查的文本。

设计取舍：
- 只做「读字」，不做「理解」。识别出的原文交给 src/review 的既有管线，
  这样多模态不会污染已经评测过的审查逻辑（引用校验、多问题拆分都还走原路）。
- 逐字转写、看不清用「□」占位、非合同直接返回标记 —— 宁可报错，不让模型编内容。
"""
import base64
import io
import time

from PIL import Image

import config
from src.llm import _llm

EXTRACT_PROMPT = """你是中文合同 OCR 助手。请把图片中的合同原文完整转写为文本。

要求：
1. 保留条款编号（第X条 / 一、/ 1.），每个条款单独起一行
2. 逐字转写，不要改写、不要总结、不得补充图片里没有的内容
3. 模糊或看不清的字用「□」占位，不要猜测
4. 只输出合同正文，不要任何说明文字，不要用 markdown 代码块
5. 如果图片不是合同或协议，只输出：NOT_A_CONTRACT"""

NOT_CONTRACT = "NOT_A_CONTRACT"

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def _b64_of(pil_img: Image.Image) -> str:
    """压缩到长边上限后转 base64 JPEG，控制 token 和耗时。"""
    img = pil_img.convert("RGB")
    w, h = img.size
    scale = min(1.0, config.VL_MAX_SIDE / max(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _strip_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def read_image(b64: str, retries: int = 2) -> str:
    """调视觉模型读一张图，返回转写文本。"""
    last = None
    for i in range(retries):
        try:
            resp = _llm.chat.completions.create(
                model=config.LLM_VL_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": EXTRACT_PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ],
                }],
                temperature=0,
                max_tokens=2000,
            )
            return _strip_fence(resp.choices[0].message.content or "")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"视觉模型调用失败：{last}")


def read_image_file(raw: bytes) -> tuple[str, int]:
    """单张图片 -> (文本, 页数=1)。"""
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"图片无法解析：{e}") from e
    return read_image(_b64_of(img)), 1


def read_scanned_pdf(raw: bytes) -> tuple[str, int]:
    """扫描版 PDF：逐页渲染成图再识别，最多 VL_MAX_PAGES 页。"""
    import pdfplumber

    texts, pages = [], 0
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for page in pdf.pages[: config.VL_MAX_PAGES]:
            pil = page.to_image(resolution=150).original
            texts.append(read_image(_b64_of(pil)))
            pages += 1
    return "\n".join(t for t in texts if t and t != NOT_CONTRACT), pages


def extract_from_upload(raw: bytes, filename: str) -> dict:
    """统一入口：按文件类型选通道，返回 {text, method, pages}。

    method:
      vision      —— 图片，走视觉模型
      pdf_text    —— 有文字层的 PDF，直接抽文字（快，零成本）
      pdf_vision  —— 扫描版 PDF，逐页走视觉模型
    """
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        import pdfplumber

        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            plain = "\n".join((p.extract_text() or "") for p in pdf.pages)
        # 文字层足够多就按文本走，省一次视觉调用
        if len(plain.strip()) >= 60:
            return {"text": plain, "method": "pdf_text", "pages": 0}
        text, pages = read_scanned_pdf(raw)
        return {"text": text, "method": "pdf_vision", "pages": pages}

    text, pages = read_image_file(raw)
    return {"text": text, "method": "vision", "pages": pages}
