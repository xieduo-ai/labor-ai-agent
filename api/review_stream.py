"""SSE 流式合同审查：供 main.py 的 /api/review（文件上传）与 /api/review_text（正文粘贴）共用。

事件序列（前端按 event 字段分发渲染）：
  meta   -> {"clauses": N}                       条款总数
  clause -> {"index", "total", "items": [...]}   每审完一条推送，前端边收边渲染
  done   -> {"summary": {...}}                   汇总指标
  error  -> {"message": "..."}                   单条失败不中断整体，最后统一汇总

汇总口径与 src/review.review_contract 保持一致（本地复制，不动已验证的评测代码）。
"""
import json
from typing import Iterator

import config
from src.review import _clause_label, review_clause, split_clauses

# 单轮处理上限，与 src/review.review_contract 的行为一致
MAX_CLAUSES = 40


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def stream_review(text: str) -> Iterator[str]:
    """把合同全文逐条审查，产出 SSE 事件流。"""
    try:
        config.sanity_check()
    except Exception as e:  # 密钥缺失等启动级错误
        yield _sse("error", {"message": f"配置检查失败：{e}"})
        return

    clauses = split_clauses(text)[:MAX_CLAUSES]
    if not clauses:
        yield _sse("error", {"message": "未识别到有效条款：请确认文本为合同条款格式（第X条 / 一、 / 1.）"})
        return

    # 合同期限是试用期上限等判断的前置条件，逐条审查时作为背景注入
    contract_ctx = next(
        (c for c in clauses if "合同期限" in c or c.lstrip().startswith("第一条")), ""
    )

    yield _sse("meta", {"clauses": len(clauses)})

    all_items = []
    failed = 0
    for i, clause in enumerate(clauses, 1):
        try:
            res = review_clause(clause, contract_ctx=contract_ctx, contract_text=text)
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
            failed += 1
            yield _sse("error", {"message": f"第 {i} 条审查失败：{e}"})

    # 汇总口径与 src/review.review_contract 一致。
    # 注意：没有任何引用时，有效率必须为 None 而不是 1.0——否则「零引用」会被显示成
    # 「100% 引用有效」，比直接报错更误导。
    cited = [b for r in all_items for b in r["legal_basis"]]
    exists_n = sum(bool(b.get("exists")) for b in cited)
    matched_n = sum(bool(b.get("quote_ok")) for b in cited if b.get("exists"))
    summary = {
        "clauses": len(clauses),
        "failed": failed,
        "issues": sum(r["risk_level"] in ("高", "中", "低") for r in all_items),
        "high": sum(r["risk_level"] == "高" for r in all_items),
        "mid": sum(r["risk_level"] == "中" for r in all_items),
        "low": sum(r["risk_level"] == "低" for r in all_items),
        "insufficient_basis": sum(bool(r.get("insufficient_basis")) for r in all_items),
        "citation_valid_rate": (exists_n / len(cited)) if cited else None,
        "quote_match_rate": (matched_n / exists_n) if exists_n else None,
    }
    yield _sse("done", {"summary": summary})


def stream_vision_review(raw: bytes, filename: str) -> Iterator[str]:
    """多模态入口：先识别图片/扫描件，再把识别结果交给同一条审查管线。

    事件序列在 stream_review 的基础上多两个：
      extract_start -> {"note": "..."}                     开始识别
      extract       -> {"text", "method", "pages"}        识别完成，前端展示原文供核对
    """
    yield _sse("extract_start", {"note": "正在识别合同文字…"})

    try:
        from src.vision import NOT_CONTRACT, extract_from_upload

        info = extract_from_upload(raw, filename)
    except Exception as e:  # noqa: BLE001  识别失败要明确告知，不能让用户以为审查过了
        yield _sse("error", {"message": f"文字识别失败：{e}"})
        return

    text = (info.get("text") or "").strip()
    if not text or text == NOT_CONTRACT:
        yield _sse("error", {"message": "没有识别到合同条款，请确认拍摄的是合同正文，且文字清晰"})
        return

    yield _sse("extract", {
        "text": text,
        "method": info.get("method", ""),
        "pages": info.get("pages", 0),
        "chars": len(text),
    })
    yield from stream_review(text)
