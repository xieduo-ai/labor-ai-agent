// 后端 API 地址。本地开发用 localhost:8000，部署后通过 NEXT_PUBLIC_API_BASE 注入。
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// ---------- 类型（与后端 pydantic 模型一一对应） ----------

export interface QASource {
  law_name: string;
  article_no: string;
  text?: string;
}

export interface QAResponse {
  answer: string;
  sources: QASource[];
}

export interface LegalBasis {
  law: string;
  article: string;
  quote: string;
  exists: boolean;
  quote_ok: boolean;
}

export interface ReviewItem {
  clause: string;
  clause_label: string;
  issue: string;
  risk_level: "高" | "中" | "低" | "无" | "未知";
  risk_type: string;
  suggestion: string;
  insufficient_basis: boolean;
  legal_basis: LegalBasis[];
}

export interface ReviewSummary {
  clauses: number;
  issues: number;
  high: number;
  mid: number;
  low: number;
  insufficient_basis: number;
  citation_valid_rate: number;
  quote_match_rate: number;
}

// SSE 事件：与后端 api/review_stream.py 的事件序列一致
export type ReviewStreamEvent =
  | { event: "meta"; clauses: number }
  | { event: "clause"; index: number; total: number; items: ReviewItem[] }
  | { event: "done"; summary: ReviewSummary }
  | { event: "error"; message: string };

// ---------- 请求 ----------

export async function askQA(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<QAResponse> {
  const r = await fetch(`${API_BASE}/api/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "请求失败");
  return r.json();
}

/**
 * 流式合同审查：POST 后逐帧读取 SSE（用 fetch 流式读取，因为 EventSource 不支持 POST）。
 * @param payload 粘贴正文传 {text}，文件上传传 FormData（含 file 字段）
 * @param onEvent 每收到一个事件回调一次，调用方据此增量渲染
 */
export async function streamReview(
  payload: { text: string } | FormData,
  onEvent: (ev: ReviewStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const isForm = payload instanceof FormData;
  const r = await fetch(
    `${API_BASE}${isForm ? "/api/review" : "/api/review_text"}`,
    {
      method: "POST",
      signal,
      ...(isForm
        ? { body: payload }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
    }
  );

  if (!r.ok) {
    let detail = "";
    try {
      detail = (await r.json()).detail || "";
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail || `请求失败（HTTP ${r.status}）`);
  }
  if (!r.body) throw new Error("当前浏览器不支持流式响应");

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE 帧以空行分隔
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const ev = parseSSEFrame(frame);
      if (ev) onEvent(ev);
    }
  }
}

function parseSSEFrame(frame: string): ReviewStreamEvent | null {
  let eventName = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!eventName || !data) return null;
  try {
    return { event: eventName, ...JSON.parse(data) } as ReviewStreamEvent;
  } catch {
    return null;
  }
}

// ---------- 工具 ----------

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
