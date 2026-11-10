import { useMemo, type ReactNode } from "react";

/**
 * 结构化回答渲染：把模型输出的长文排成「一目了然」的版式。
 *
 * 参照老师指定的对标产品（得理法搜智能对话页）：
 *   一、核心结论  -> 大标题
 *   二、法律分析  -> 大标题
 *   （一）小标题  -> 次级标题
 *   | 情形 | 权利 | 依据 |  -> 表格
 *   《劳动合同法》第X条 -> 蓝色内联链接，点击跳到右侧资料栏
 *
 * 关键约束：
 * - 不引第三方 markdown 库、不用 dangerouslySetInnerHTML（模型输出不可信）。
 * - 流式逐字输出时标题/表格可能只到一半，解析要容错，不能闪烁或崩。
 * - 法条链接只在答完（!streaming）时可点，避免流式过程中链接反复跳变。
 */

/**
 * 把 **加粗** 和《法律名》第X条 渲染成内联节点。
 * verifiedArticles 是本次 search_law 真实命中的条号集合；不在集合里的引用
 * 会显式标成「未核验」，避免把模型凭记忆补的条号伪装成已核验依据。
 */
function inline(
  text: string,
  keyPrefix: string,
  onLawClick?: (name: string) => void,
  verifiedArticles?: Set<string>
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lawRe = /(《[^》]{2,40}》(?:第[一二三四五六七八九十百零0-9]+条(?:第[一二三四五六七八九十百零0-9]+款)?(?:第[一二三四五六七八九十百零0-9]+项)?))/g;

  let cursor = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = lawRe.exec(text)) !== null) {
    if (m.index > cursor) {
      nodes.push(...boldNodes(text.slice(cursor, m.index), `${keyPrefix}-p${key++}`));
    }
    const name = m[1];
    const article = /第[一二三四五六七八九十百零0-9]+条/.exec(name)?.[0] ?? "";
    const unverified = verifiedArticles && verifiedArticles.size > 0 && !verifiedArticles.has(article);
    nodes.push(
      <button
        key={`${keyPrefix}-law${key++}`}
        type="button"
        onClick={() => onLawClick?.(name)}
        title={
          unverified
            ? "本次检索未命中该条，请核对后再引用"
            : "在右侧资料栏查看该条文原文"
        }
        className={
          unverified
            ? "mx-0.5 rounded px-0.5 font-medium text-amber-700 underline decoration-amber-400 decoration-dotted underline-offset-2 hover:bg-amber-50"
            : "mx-0.5 rounded px-0.5 font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:bg-blue-50 hover:decoration-blue-600"
        }
      >
        {name}
        {unverified && <span className="ml-0.5 text-[10px] no-underline">⚠未核验</span>}
      </button>
    );
    cursor = lawRe.lastIndex;
  }
  if (cursor < text.length) {
    nodes.push(...boldNodes(text.slice(cursor), `${keyPrefix}-p${key++}`));
  }
  return nodes;
}

function boldNodes(text: string, keyPrefix: string): ReactNode[] {
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

/** 中文数字大标题：一、二、三… 或 markdown ## 标题 */
const H1_RE = /^\s*(?:#{1,2}\s*)?([一二三四五六七八九十]+[、．.])\s*(.*)$/;
/** 小标题：（一）（二）或 (一) 或 markdown ### */
const H2_RE = /^\s*(?:#{3}\s*)?[（(]([一二三四五六七八九十]+)[）)]\s*(.*)$/;
const BULLET_RE = /^\s*(?:[-*•]|\d+[、．.])\s+(.*)$/;

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

export function StructuredAnswer({
  text,
  streaming,
  onLawClick,
  verifiedArticles,
}: {
  text: string;
  streaming?: boolean;
  onLawClick?: (name: string) => void;
  /** 本次 search_law 命中的条号，如「第八十七条」 */
  verifiedArticles?: string[];
}) {
  const verified = useMemo(
    () => new Set(verifiedArticles ?? []),
    [verifiedArticles]
  );
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 表格：连续的 | 开头行；分隔行跳过。流式时最后一行可能不完整，照样渲染
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!isTableSep(lines[i])) {
          rows.push(
            lines[i]
              .trim()
              .replace(/^\||\|$/g, "")
              .split("|")
              .map((c) => c.trim())
          );
        }
        i++;
      }
      if (rows.length) {
        const head = rows[0];
        const body = rows.slice(1);
        blocks.push(
          <div key={`t${key++}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead className="bg-slate-50">
                <tr>
                  {head.map((h, j) => (
                    <th key={j} className="border-b border-slate-200 px-3 py-2 font-medium text-slate-700">
                      {boldNodes(h, `th${key}-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri} className="border-b border-slate-100 last:border-0">
                    {head.map((_, ci) => (
                      <td key={ci} className="px-3 py-2 align-top leading-relaxed text-slate-600">
                        {r[ci] ? inline(r[ci], `td${key}-${ri}-${ci}`, onLawClick, verified) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    const h1 = H1_RE.exec(line);
    if (h1) {
      blocks.push(
        <div key={`h1-${key++}`} className="mt-6 flex items-baseline gap-2 first:mt-0">
          <span className="text-[17px] font-semibold tracking-tight text-slate-900">{h1[1]}</span>
          <span className="text-[17px] font-semibold tracking-tight text-slate-900">{h1[2]}</span>
        </div>
      );
      i++;
      continue;
    }

    const h2 = H2_RE.exec(line);
    if (h2) {
      blocks.push(
        <div key={`h2-${key++}`} className="mt-4 text-[14px] font-semibold text-slate-800">
          （{h2[1]}）{h2[2]}
        </div>
      );
      i++;
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push(
        <div key={`li-${key++}`} className="flex gap-2 py-0.5 text-[13.5px] leading-relaxed text-slate-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
          <span>{inline(bullet[1], `li${key}`, onLawClick, verified)}</span>
        </div>
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      blocks.push(<div key={`sp-${key++}`} className="h-2" />);
      i++;
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="text-[13.5px] leading-[1.85] text-slate-700">
        {inline(line, `p${key}`, streaming ? undefined : onLawClick, verified)}
      </p>
    );
    i++;
  }

  return (
    <div className="max-w-none">
      {blocks}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-middle" />
      )}
    </div>
  );
}
