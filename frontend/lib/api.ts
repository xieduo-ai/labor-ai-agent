// 后端 API 地址。本地开发用 localhost:8000，部署后用环境变量。
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface QASource {
  law_name: string;
  article_no: string;
  text?: string;
}

export interface QAResponse {
  answer: string;
  sources: QASource[];
}

export interface ReviewItem {
  clause: string;
  clause_label: string;
  issue: string;
  risk_level: "高" | "中" | "低" | "无" | "未知";
  risk_type: string;
  suggestion: string;
  insufficient_basis: boolean;
  legal_basis: Array<{
    law: string;
    article: string;
    quote: string;
    exists: boolean;
    quote_ok: boolean;
  }>;
}

export interface ReviewReport {
  summary: {
    clauses: number;
    issues: number;
    high: number;
    mid: number;
    low: number;
    insufficient_basis: number;
    citation_valid_rate: number;
  };
  items: ReviewItem[];
}

export async function askQA(question: string): Promise<QAResponse> {
  const r = await fetch(`${API_BASE}/api/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: [] }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "请求失败");
  return r.json();
}

export async function reviewText(text: string): Promise<ReviewReport> {
  const r = await fetch(`${API_BASE}/api/review_text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "审查失败");
  return r.json();
}
