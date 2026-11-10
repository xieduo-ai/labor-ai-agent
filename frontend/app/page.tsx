import Image from "next/image";
import Link from "next/link";
import { JUDGMENT_CASES } from "@/data/caseRefs";
import { HomeCases } from "@/components/HomeCases";

const STATS = [
  { label: "法规覆盖", value: "14 部", sub: "678 条原文", tone: "text-amber-300" },
  { label: "检索召回率", value: "82.5%", sub: "口语化问题 Recall@5", tone: "text-sky-300" },
  { label: "合同风险召回", value: "100%", sub: "19 个人工埋点全部命中", tone: "text-white" },
  { label: "引用有效率", value: "100%", sub: "closed-set 零幻觉", tone: "text-white" },
];

const PILLARS = [
  {
    tag: "01 · 答得有出处",
    title: "14 部法规，678 条原文",
    desc: "检索限定在自建法规库，引用限定在候选条文的闭集内。模型编不出闭集之外的法条，每条依据都能点开看原文。",
    tone: "text-amber-300",
    ring: "border-amber-300/25",
  },
  {
    tag: "02 · 算得出数",
    title: "赔偿不是模型心算的",
    desc: "第 47、87 条写成确定性规则引擎，三倍封顶、12 年上限、违法解除 2N 都按法条算。涉及金额的提问，Agent 会先查依据再调计算工具。",
    tone: "text-sky-300",
    ring: "border-sky-300/25",
  },
  {
    tag: "03 · 错了能暴露",
    title: "不把不确定包装成满分",
    desc: "摘录与原文逐字比对，不符就标出；一条引用都没有时指标显示空值并提示结果不完整；文书里模型自行补全的月份与金额会被事实核对拦下来。",
    tone: "text-white/70",
    ring: "border-white/15",
  },
];

/**
 * 首页：打开链接即全屏左右双栏——左劳动者（黄金橙）、右企业（深钢蓝）。
 *
 * 设计取舍：
 * - 首屏不设独立 Hero 区，两块各占半个视口且铺满高度，slogan 与硬指标放到滚动后的深色区。
 * - 首屏是强对比暗色，若下方直接接纯白会割裂：改用纵向渐变过渡带
 *   （两端与上下区块同色，没有横向色带的硬边），下方数据区与主题卡区统一深蓝，
 *   footer 同为深色，整页一条线到底。黄蓝呼应交给数据卡的琥珀/天蓝数字。
 * - 结尾不再放「技术管线」等宽字流程图（像终端日志），换成三张贴主题的卡片；
 *   真正的技术细节留在 30 页技术文档里。
 * - 两张主题剪影为本项目原创生成素材（public/hero-*.webp，合计 66KB），无版权风险。
 * - 横版图放进竖长半屏时用取自原图天空色的同色渐变补回左侧纯色面（globals.css）。
 * - 黄底用深墨蓝字、蓝底用白字；桌面悬停一侧聚焦、另一侧变暗，纯 CSS :has()。
 * - 功能页 /review、/agent 一律不动：那里是评委核验技术的地方，保持清晰工具风。
 */
export default function Home() {
  return (
    <div className="flex-1 bg-[#0b1728]">
      {/* 首屏：全屏左右双栏 */}
      <section className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-brand px-4 pb-5 pt-5 md:px-6">
        <h1 className="sr-only">
          明契 · 用工合规 AI Agent，让每一份劳动合同都经得起仲裁庭的检验
        </h1>
        <div className="mx-auto flex w-full max-w-[1600px] flex-1">
          <div className="dual-panel relative flex-1 overflow-hidden rounded-2xl border border-white/10">
            {/* 左：劳动者 · 黄金橙 */}
            <Link
              href="/worker/chat"
              className="dual-side group relative block min-h-[340px] bg-[#B86320] md:min-h-0"
            >
              <Image
                src="/hero-worker.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="panel-photo object-cover object-right"
              />
              <div className="sky-worker absolute inset-0" />
              <div className="panel-copy absolute inset-0 flex flex-col justify-start px-7 pt-10 text-brand md:px-12 md:pt-16">
                <div className="text-xs font-medium tracking-[0.2em] text-brand/70">
                  FOR WORKERS · 劳动者端
                </div>
                <h2 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
                  我是劳动者
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-brand/80 md:text-base">
                  被辞退了能拿多少钱？公司不缴社保怎么办？试用期被坑怎么维权？
                  像跟懂法的朋友聊天一样提问，答案逐条带法条原文。
                </p>
                <span className="mt-8 inline-flex w-fit rounded-full bg-brand px-6 py-3 text-sm font-medium text-white transition-transform group-hover:translate-x-1 md:text-base">
                  开始咨询 →
                </span>
                <div className="mt-6 hidden text-xs tracking-widest text-brand/50 md:block">
                  14 部法规 · 678 条原文 · 口语提问也能查到依据
                </div>
              </div>
              <div className="dim-shade" />
            </Link>

            {/* 右：企业 HR · 深钢蓝 */}
            <Link
              href="/review"
              className="dual-side group relative block min-h-[340px] bg-[#081020] md:min-h-0"
            >
              <Image
                src="/hero-enterprise.webp"
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="panel-photo object-cover object-right"
              />
              <div className="sky-enterprise absolute inset-0" />
              <div className="panel-copy absolute inset-0 flex flex-col justify-start px-7 pt-10 text-white md:px-12 md:pt-16">
                <div className="text-xs font-medium tracking-[0.2em] text-sky-200/80">
                  FOR HR · 企业端
                </div>
                <h2 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
                  我是企业 HR
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/85 md:text-base">
                  上传或拍下合同，逐条识别试用期超期、放弃社保、无补偿竞业限制等风险，
                  每条结论都附可核验的法条原文。
                </p>
                <span className="mt-8 inline-flex w-fit rounded-full bg-white px-6 py-3 text-sm font-medium text-brand transition-transform group-hover:translate-x-1 md:text-base">
                  审合同 →
                </span>
                <div className="mt-6 hidden text-xs tracking-widest text-white/45 md:block">
                  流式逐条审查 · closed-set 引用 · 报告可导出
                </div>
              </div>
              <div className="dim-shade" />
            </Link>

            {/* 中缝圆标：pointer-events-none，不挡两侧点击 */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 hidden -translate-x-1/2 -translate-y-1/2 md:flex md:flex-col md:items-center">
              <div className="seal-badge flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white text-lg font-medium text-brand shadow-lg">
                契
              </div>
              <div className="mt-2 whitespace-nowrap rounded-full bg-slate-950/45 px-2.5 py-1 text-xs text-white/80">
                同一份契约 · 两端放心
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          桌面端把鼠标移到任意一侧试试：另一侧会自动暗下去 · 移动端上下排列 · 剪影素材为本项目原创生成
        </p>
      </section>

      {/* 建议六：首页首屏不动，下方补「其他角色 / 通用法律问题」入口。
          双栏仍是主视觉，这里承接非劳动者 / 非 HR 的咨询需求，并划清能力边界。 */}
      <section className="bg-brand py-7">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <div className="text-[15px] font-semibold text-white">不是劳动者，也不是企业 HR？</div>
            <p className="mt-1 text-[12.5px] text-white/70">
              其他角色或通用法律问题，也可以来问 —— 本助手聚焦劳动法领域，其余仅作常识性参考。
            </p>
          </div>
          <Link
            href="/agent"
            className="shrink-0 rounded-full bg-white px-6 py-2.5 text-[13px] font-medium text-brand transition-transform hover:translate-x-1"
          >
            去智能助手提问 →
          </Link>
        </div>
      </section>

      {/* 纵向渐变过渡：两端与上下区块同色，不形成横向色带 */}
      <div className="section-seam h-20" aria-hidden="true" />

      {/* 第二屏：slogan + 硬指标（深色延续，不再突然变白） */}
      <section className="bg-[#0b1728] py-16 text-white md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold md:text-3xl">
            让每一份劳动合同，都经得起仲裁庭的检验
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-white/55">
            不是「能聊」，是「答得有出处、错了能算出来」。自建 40 题口语化评测集 + 3 份埋坑合同，每一层 RAG 都用数据说话。
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-white/10 bg-white/5 p-6 text-center"
              >
                <div className={`text-3xl font-bold ${s.tone}`}>{s.value}</div>
                <div className="mt-1 text-sm font-medium text-white/85">{s.label}</div>
                <div className="mt-1 text-xs text-white/45">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 结尾：三张贴主题的文字卡，替代原先像终端日志的技术管线 */}
      <section className="bg-[#0b1728] pb-20 pt-4">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-white">
            一份合同，两端都该放心
          </h2>
          <p className="mt-2 text-center text-sm text-white/50">
            我们把力气花在「可核验」上，而不是让 AI 说得更像专家
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div
                key={p.tag}
                className={`rounded-2xl border bg-white/5 p-7 ${p.ring}`}
              >
                <div className={`text-xs font-medium tracking-widest ${p.tone}`}>
                  {p.tag}
                </div>
                <h3 className="mt-3 text-xl font-bold text-white">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/review"
              className="inline-flex rounded-full bg-worker px-7 py-3 text-sm font-medium text-white transition-transform hover:translate-x-1"
            >
              上传一份合同试试 →
            </Link>
            <p className="mt-4 text-xs text-white/35">
              仅供学习研究，不构成法律意见 · 知识库覆盖 14 部劳动法规 / 678 条
            </p>
          </div>
        </div>
      </section>

      {/* 建议四：典型劳动争议案例区块，不问也能看到（闭集静态展示，可点击核验出处） */}
      <HomeCases cases={JUDGMENT_CASES} />
    </div>
  );
}
