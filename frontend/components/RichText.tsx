import type { ReactNode } from "react";

/**
 * 轻量富文本渲染，复用在 Agent 回答和劳动法问答两处。
 *
 * 处理三类模型常输出的 markdown：**加粗**、#/##/### 标题、- 列表。
 * 不引第三方 markdown 库（模型输出不可信，为几个标记引依赖不值），
 * 也不用 dangerouslySetInnerHTML（避免 XSS）。
 *
 * 流式输出时标记可能只到了一半：未闭合的 ** 按普通文本显示，
 * 行首 # 只在后面确实有空格时才识别，因此逐字输出过程中不会闪烁。
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let cursor = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    nodes.push(
      <strong key={`${keyPrefix}-b${key++}`} className="font-semibold text-slate-900">
        {m[1]}
      </strong>
    );
    cursor = re.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const heading = /^(#{1,4})\s+(.*)$/.exec(line);
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);

        if (heading) {
          const level = heading[1].length;
          const cls =
            level <= 1
              ? "text-base font-semibold"
              : level === 2
                ? "text-sm font-semibold"
                : "text-sm font-medium";
          return (
            <div key={i} className={`mt-2 text-slate-900 first:mt-0 ${cls}`}>
              {inline(heading[2], `h${i}`)}
            </div>
          );
        }
        if (bullet) {
          return (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-slate-400">·</span>
              <span>{inline(bullet[1], `l${i}`)}</span>
            </div>
          );
        }
        // 空行保留一行高度，避免段落粘在一起
        return (
          <div key={i} className="min-h-[1em] text-sm leading-relaxed">
            {inline(line, `p${i}`)}
          </div>
        );
      })}
    </>
  );
}
