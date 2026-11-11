import type { ReactNode } from "react";

/**
 * 轻量富文本渲染，复用在 Agent 回答和劳动法问答两处。
 *
 * 支持模型常输出的 markdown：**加粗**、#/##/### 标题、- 列表，以及
 * | 列1 | 列2 | 形式的表格。
 * 不引第三方 markdown 库（模型输出不可信，为几个标记引依赖不值），
 * 也不用 dangerouslySetInnerHTML（避免 XSS）。
 *
 * 流式输出时标记可能只到了一半：未闭合的 ** 按普通文本显示，
 * 行首 # 只在后面确实有空格时才识别；表格要等出现 | --- | 分隔行才
 * 渲染成表格，分隔行到达之前先按普通文本显示，避免逐字过程中闪烁或错位。
 */

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

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
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let key = 0;
  let i = 0;

  const pushParagraph = (line: string) => {
    out.push(
      <div key={key++} className="min-h-[1em] text-sm leading-relaxed">
        {inline(line, `p${key}`)}
      </div>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // 表格块：连续的 | 行
    if (/^\s*\|/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      // 只有出现 | --- | 分隔行才认定为表格，否则（流式未完或只是带竖线文本）
      // 先按普通段落显示，避免逐字过程中表格结构抖动
      if (block.some((r) => isTableSep(r))) {
        const cells = (r: string) =>
          r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = cells(block[0]);
        const sepIdx = block.findIndex((r) => isTableSep(r));
        const body = block.slice(sepIdx + 1).map(cells);
        out.push(
          <div key={key++} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead className="bg-slate-50">
                <tr>
                  {head.map((h, j) => (
                    <th
                      key={j}
                      className="border-b border-slate-200 px-3 py-2 font-medium text-slate-700"
                    >
                      {inline(h, `th${key}-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri} className="border-b border-slate-100 last:border-0">
                    {head.map((_, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2 align-top leading-relaxed text-slate-600"
                      >
                        {inline(r[ci] ?? "", `td${key}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      // 回退：逐行当普通段落
      block.forEach((r) => pushParagraph(r));
      continue;
    }

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
      out.push(
        <div key={key++} className={`mt-2 text-slate-900 first:mt-0 ${cls}`}>
          {inline(heading[2], `h${key}`)}
        </div>
      );
      i++;
      continue;
    }
    if (bullet) {
      out.push(
        <div key={key++} className="flex gap-2 text-sm">
          <span className="text-slate-400">·</span>
          <span>{inline(bullet[1], `l${key}`)}</span>
        </div>
      );
      i++;
      continue;
    }
    // 普通段落（含空行，空行保留一行高度避免段落粘在一起）
    pushParagraph(line);
    i++;
  }

  return <>{out}</>;
}
