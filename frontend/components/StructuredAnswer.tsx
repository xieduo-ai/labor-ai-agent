import { useMemo, type ReactNode } from "react";

/**
 * 结构化回答渲染：把模型输出的长文排成「一目了然」的版式。
 *
 * 参照老师指定的对标产品（得理法搜智能对话页），回答按固定顺序包成卡片：
 *   一、核心结论  -> 结论卡（琥珀底，突出金额/时限）
 *   二、法律分析  -> 分析卡（白底，含法条链接、情形表格）
 *   三、行动建议  -> 行动清单卡（翠绿底，可执行步骤）
 *
 * 右侧「相关资料」栏已承载法条原文与类案，这里只负责把正文排成卡片流。
 *
 * 关键约束：
 * - 不引第三方 markdown 库、不用 dangerouslySetInnerHTML（模型输出不可信）。
 * - 流式逐字输出时标题/表格可能只到一半，解析要容错，不能闪烁或崩。
 * - 法条链接只在答完（!streaming）时可点，避免流式过程中链接反复跳变。
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

type Block =
  | { t: "h1"; text: string }
  | { t: "h2"; text: string }
  | { t: "bullet"; text: string }
  | { t: "p"; text: string }
  | { t: "table"; head: string[]; body: string[][] }
  | { t: "sp" };

function parseBlocks(
  text: string,
  onLawClick?: (name: string) => void,
  verified?: Set<string>
): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

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
        blocks.push({ t: "table", head, body });
      }
      continue;
    }

    const h1 = H1_RE.exec(line);
    if (h1) {
      blocks.push({ t: "h1", text: `${h1[1]} ${h1[2]}` });
      i++;
      continue;
    }

    const h2 = H2_RE.exec(line);
    if (h2) {
      blocks.push({ t: "h2", text: `（${h2[1]}）${h2[2]}` });
      i++;
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      blocks.push({ t: "bullet", text: bullet[1] });
      i++;
      continue;
    }

    if (!line.trim()) {
      blocks.push({ t: "sp" });
      i++;
      continue;
    }

    blocks.push({ t: "p", text: line });
    i++;
  }
  return blocks;
}

/** 把扁平 block 列表按 H1 切成若干卡片段落 */
function toSections(blocks: Block[]): { title: string; kind: "conclusion" | "analysis" | "action"; blocks: Block[] }[] {
  const sections: { title: string; kind: "conclusion" | "analysis" | "action"; blocks: Block[] }[] = [];
  let cur: { title: string; kind: "conclusion" | "analysis" | "action"; blocks: Block[] } | null = null;

  const kindOf = (title: string): "conclusion" | "analysis" | "action" => {
    if (/结论/.test(title)) return "conclusion";
    if (/建议|行动/.test(title)) return "action";
    return "analysis";
  };

  for (const b of blocks) {
    if (b.t === "h1") {
      cur = { title: b.text, kind: kindOf(b.text), blocks: [] };
      sections.push(cur);
    } else {
      if (!cur) {
        cur = { title: "", kind: "analysis", blocks: [] };
        sections.push(cur);
      }
      cur.blocks.push(b);
    }
  }
  return sections;
}

function renderBlock(b: Block, key: string, streaming: boolean, onLawClick?: (name: string) => void, verified?: Set<string>): ReactNode {
  switch (b.t) {
    case "h2":
      return (
        <div key={key} className="mt-3 text-[14px] font-semibold text-slate-800">
          {b.text}
        </div>
      );
    case "bullet":
      return (
        <div key={key} className="flex gap-2 py-0.5 text-[13.5px] leading-relaxed text-slate-700">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
          <span>{inline(b.text, key, streaming ? undefined : onLawClick, verified)}</span>
        </div>
      );
    case "table":
      return (
        <div key={key} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} className="border-b border-slate-200 px-3 py-2 font-medium text-slate-700">
                    {boldNodes(h, `${key}-th${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.body.map((r, ri) => (
                <tr key={ri} className="border-b border-slate-100 last:border-0">
                  {b.head.map((_, ci) => (
                    <td key={ci} className="px-3 py-2 align-top leading-relaxed text-slate-600">
                      {r[ci] ? inline(r[ci], `${key}-${ri}-${ci}`, streaming ? undefined : onLawClick, verified) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "sp":
      return <div key={key} className="h-2" />;
    default:
      return (
        <p key={key} className="text-[13.5px] leading-[1.85] text-slate-700">
          {inline(b.text, key, streaming ? undefined : onLawClick, verified)}
        </p>
      );
  }
}

const SECTION_STYLE: Record<string, { wrap: string; tag: string; tagText: string }> = {
  conclusion: {
    wrap: "border-amber-200 bg-amber-50/50",
    tag: "bg-amber-100 text-amber-700",
    tagText: "结论",
  },
  analysis: {
    wrap: "border-slate-200 bg-white",
    tag: "bg-slate-100 text-slate-600",
    tagText: "分析",
  },
  action: {
    wrap: "border-emerald-200 bg-emerald-50/50",
    tag: "bg-emerald-100 text-emerald-700",
    tagText: "行动",
  },
};

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
  const sections = useMemo(
    () => toSections(parseBlocks(text, onLawClick, verified)),
    [text, streaming, onLawClick, verified]
  );

  return (
    <div className="max-w-none space-y-3">
      {sections.map((s, si) => {
        const st = SECTION_STYLE[s.kind];
        return (
          <div key={si} className={`rounded-2xl border p-4 ${st.wrap}`}>
            {s.title && (
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.tag}`}>
                  {st.tagText}
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-slate-900">
                  {s.title}
                </span>
              </div>
            )}
            <div>
              {s.blocks.map((b, bi) =>
                renderBlock(b, `s${si}-b${bi}`, !!streaming, onLawClick, verified)
              )}
            </div>
          </div>
        );
      })}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-brand align-middle" />
      )}
    </div>
  );
}
