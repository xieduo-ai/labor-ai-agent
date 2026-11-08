import type { QASource } from "@/lib/api";

/** 问答回答附带的法条引用列表。抽成组件后，问答页只负责消息流。 */
export function SourceList({ sources }: { sources?: QASource[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className="mb-1 text-xs font-medium text-slate-500">
        📚 引用法条（{sources.length} 条）
      </div>
      {sources.map((s, j) => (
        <div key={j} className="mt-1 text-xs text-slate-600">
          <span className="font-medium text-brand">
            《{s.law_name}》{s.article_no}
          </span>
          {s.text && (
            <span className="ml-1 text-slate-400">— {s.text.slice(0, 60)}…</span>
          )}
        </div>
      ))}
    </div>
  );
}
