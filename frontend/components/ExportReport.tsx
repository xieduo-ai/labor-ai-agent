"use client";

import type { ReviewItem, ReviewSummary } from "@/lib/api";
import { rate } from "@/components/ReviewParts";

/**
 * 审查报告导出（Markdown），纯前端生成、不经过任何服务器。
 *
 * 两个真实的考虑：
 * 1. 用户上传的合同是最敏感的个人材料，本项目明确不落库、不上传第三方；
 *    连导出都在浏览器本地完成，这个承诺才站得住。
 * 2. HR / 劳动者真正要的不是看一眼网页，而是一份能发给对方、能留存的整改清单。
 *    没有导出，前面的审查结果就停留在「演示」。
 */
export function ExportReport({
  items,
  summary,
}: {
  items: ReviewItem[];
  summary: ReviewSummary | null;
}) {
  if (!summary) return null;

  function build(): string {
    const s = summary;
    if (!s) return ""; // 按钮只在 summary 存在时渲染，这里再收窄一次类型
    const lines: string[] = [
      "# 劳动合同风险审查报告",
      "",
      `生成时间：${new Date().toLocaleString("zh-CN")}`,
      "",
      "> 本报告由「明契 · 用工合规 AI Agent」自动生成，仅供学习研究，不构成法律意见。",
      "> 正式维权或据此修改合同前，请咨询当地法律援助或执业律师。",
      "",
      "## 一、汇总",
      "",
      "| 指标 | 数值 |",
      "| --- | --- |",
      `| 审查条款 | ${s.clauses} 条 |`,
      `| 审查失败 | ${s.failed} 条 |`,
      `| 高风险 / 中风险 / 低风险 | ${s.high} / ${s.mid} / ${s.low} |`,
      `| 引用有效率 | ${rate(s.citation_valid_rate)} |`,
      `| 摘录逐字率 | ${rate(s.quote_match_rate)} |`,
      "",
      "> 引用有效率 = 引用命中闭集候选条文的比例；摘录逐字率 = 摘录与条文原文逐字一致的比例。",
      "> 任一指标为「—」表示本次没有可核验的引用，不能视为 100%。",
      "",
    ];

    if (s.failed > 0) {
      lines.push(
        `> ⚠️ 本次有 ${s.failed} 条审查失败，结果不完整，不能作为「合同无风险」的结论。`,
        ""
      );
    }

    const risks = items.filter((it) => it.risk_level !== "无");
    lines.push("## 二、风险清单", "");
    if (risks.length === 0) {
      lines.push("本次未发现明显风险条款。", "");
    } else {
      risks.forEach((it, i) => {
        lines.push(
          `### ${i + 1}. [${it.risk_level}] ${it.risk_type} · ${it.clause_label}`,
          "",
          `**原文**：${it.clause.replace(/\s+/g, " ").trim()}`,
          "",
          `**问题**：${it.issue}`,
          ""
        );
        if (it.suggestion) lines.push(`**修改建议**：${it.suggestion}`, "");
        if (it.legal_basis.length > 0) {
          lines.push("**法律依据**：", "");
          it.legal_basis.forEach((b) => {
            const status = !b.exists
              ? "⚠️ 依据存疑"
              : b.quote_ok
                ? "✅ 摘录与原文一致"
                : "⚠️ 摘录与原文不符";
            lines.push(`- 《${b.law}》${b.article}（${status}）`);
            if (b.quote) lines.push(`  - 原文摘录：${b.quote}`);
          });
          lines.push("");
        }
        if (it.insufficient_basis) {
          lines.push("> ⚠️ 候选法条中未找到直接依据，已如实标注。", "");
        }
      });
    }

    lines.push(
      "## 三、说明",
      "",
      "- 审查基于 14 部劳动法规 678 条条文的本地索引，引用限定在检索候选闭集内。",
      "- 闭集引用能保证「引用的条文一定存在」，但不保证选中的是候选里最贴切的一条。",
      "- 法规会修订，本报告依据的是生成时的知识库快照。",
      ""
    );
    return lines.join("\n");
  }

  function download() {
    const blob = new Blob([build()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate()
    ).padStart(2, "0")}`;
    a.href = url;
    a.download = `劳动合同风险审查报告-${stamp}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-brand hover:text-brand"
    >
      ⬇ 导出审查报告（浏览器本地生成）
    </button>
  );
}
