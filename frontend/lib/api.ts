// 后端 API 地址。本地开发用 localhost:8000，部署后通过 NEXT_PUBLIC_API_BASE 注入。
// 用 ?? 而非 ||：显式注入空字符串时表示「同源」（备用镜像由同一进程托管前后端），
// 未注入时仍回落本地后端，保证本地开发 / Railway 现有部署行为不变。
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

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
  /** 「如果签了会怎样」：量化后果，人话。无则「—」 */
  consequence: string;
}

export interface ReviewSummary {
  clauses: number;
  /** 审查失败的条款数，>0 时结果不完整，前端要显式提示 */
  failed: number;
  issues: number;
  high: number;
  mid: number;
  low: number;
  insufficient_basis: number;
  /** 没有任何引用时为 null（不能报 100%） */
  citation_valid_rate: number | null;
  quote_match_rate: number | null;
}

// SSE 事件：与后端 api/review_stream.py 的事件序列一致
export type ReviewStreamEvent =
  | { event: "meta"; clauses: number }
  | { event: "clause"; index: number; total: number; items: ReviewItem[] }
  | { event: "done"; summary: ReviewSummary }
  | { event: "error"; message: string }
  // 多模态专属：开始识别 / 识别完成（原文供用户核对）
  | { event: "extract_start"; note: string }
  | {
      event: "extract";
      text: string;
      method: "vision" | "pdf_text" | "pdf_vision" | string;
      pages: number;
      chars: number;
    };

// SSE 事件：与后端 api/agent.py 的事件序列一致
export type AgentStreamEvent =
  // 进入工具循环之前的领域前置判定（src/domain_guard.py）。
  // in_domain=false 时后端短路：不检索法条、不调工具、不生成类案。
  | { event: "domain"; in_domain: boolean; topic: string; notice: string; confidence: string }
  // 复杂任务第一步：模型自主登记的执行计划（src/tools.plan_tasks）
  | { event: "plan"; goal: string; steps: string[] }
  | {
      event: "step";
      kind: "tool_call" | "tool_result";
      tool: string;
      label: string;
      /** tool_call 时的入参 */
      args?: Record<string, unknown>;
      /** tool_result 时的一行摘要 */
      detail?: string;
      /** tool_result 时的完整返回，用于展示法条原文 / 金额构成 */
      result?: Record<string, unknown>;
    }
  | { event: "token"; text: string }
  | { event: "done"; tools_used: string[]; rounds: number; citation_audit?: CitationAudit | null; in_domain?: boolean }
  | { event: "error"; message: string };

/** 后端把回答里每个条号与本次 search_law 命中做比对的结果 */
export interface CitationAudit {
  total: number;
  verified: number;
  unverified: string[];
  whitelist: string[];
}

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
 * SSE 通用读取：POST 后逐帧解析（EventSource 不支持 POST，所以手写解析）。
 * 审查和 Agent 两个流式接口共用这一套，避免各写一份解析逻辑。
 */
async function sseRequest(
  url: string,
  init: RequestInit,
  onFrame: (ev: Record<string, unknown> & { event: string }) => void
): Promise<void> {
  const r = await fetch(url, init);

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
      if (ev) onFrame(ev);
    }
  }
}

/**
 * 流式合同审查。
 * @param payload 粘贴正文传 {text}，文件/图片上传传 FormData（含 file 字段）
 * @param path 覆盖接口路径：图片走 /api/review_image
 */
export async function streamReview(
  payload: { text: string } | FormData,
  onEvent: (ev: ReviewStreamEvent) => void,
  signal?: AbortSignal,
  path?: string
): Promise<void> {
  const isForm = payload instanceof FormData;
  const url = `${API_BASE}${path ?? (isForm ? "/api/review" : "/api/review_text")}`;
  await sseRequest(
    url,
    {
      method: "POST",
      signal,
      ...(isForm
        ? { body: payload }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
    },
    (ev) => onEvent(ev as unknown as ReviewStreamEvent)
  );
}

/**
 * 流式 Agent：逐条推送工具调用/结果，最后逐字输出回答。
 * 前端把 step 事件渲染成「工具调用时间线」，token 事件拼成最终回答。
 */
export async function streamAgent(
  body: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }>; contract_text?: string },
  onEvent: (ev: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  await sseRequest(
    `${API_BASE}/api/agent/stream`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    (ev) => onEvent(ev as unknown as AgentStreamEvent)
  );
}

function parseSSEFrame(frame: string): ({ event: string } & Record<string, unknown>) | null {
  let eventName = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!eventName || !data) return null;
  try {
    return { event: eventName, ...JSON.parse(data) };
  } catch {
    return null;
  }
}

// ---------- 工具 ----------

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
