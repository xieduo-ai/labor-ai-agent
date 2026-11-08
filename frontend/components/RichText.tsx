import type { ReactNode } from "react";

/**
 * 极简富文本：只把 **加粗** 渲染成 <strong>，其余原样输出。
 *
 * 复用在 Agent 回答和劳动法问答两处。不引 markdown 库（模型输出不可信，
 * 为两个星号引依赖不值），也不用 dangerouslySetInnerHTML（避免 XSS）。
 * 流式输出时 `**` 可能只到了一半，未闭合的标记按普通文本显示，
 * 等 token 凑齐后自动变成加粗，所以逐字输出过程中不会闪烁。
 */
export function RichText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let cursor = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    nodes.push(
      <strong key={key++} className="font-semibold text-slate-900">
        {m[1]}
      </strong>
    );
    cursor = re.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
