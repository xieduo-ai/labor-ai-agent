import Image from "next/image";
import Link from "next/link";

const STATS = [
  { label: "法规覆盖", value: "14 部", sub: "678 条原文" },
  { label: "检索召回率", value: "82.5%", sub: "口语化问题 Recall@5" },
  { label: "合同风险召回", value: "100%", sub: "19 个人工埋点全部命中" },
  { label: "引用有效率", value: "100%", sub: "closed-set 零幻觉" },
];

/**
 * 首页：打开链接即全屏左右双栏——左劳动者（黄金橙）、右企业（深钢蓝）。
 *
 * 设计取舍：
 * - 首屏不设独立 Hero 区，两块各占半个视口且铺满高度，slogan 与硬指标放到滚动后的第二屏，
 *   保证「进去就是左右两块」的沉浸感，同时评委仍能找到数据。
 * - 两张主题剪影为本项目原创生成素材（public/hero-*.webp，合计 66KB），无版权风险；
 *   已裁掉生成工具水印，用 next/image 做尺寸与格式优化。
 * - 横版图放进竖长半屏会被裁掉大量左右内容，因此用取自原图天空色的同色渐变
 *   （globals.css 的 .sky-worker / .sky-enterprise）补回左侧纯色面：
 *   文字永远落在干净色块上，右侧剪影完整保留，不是盖灰蒙版。
 * - 黄底用深墨蓝字、蓝底用白字；桌面悬停单侧展开用纯 CSS :has()，手机上下堆叠不展开。
 * - 功能页 /review、/agent 一律不动：那里是评委核验技术的地方，保持清晰工具风。
 */
export default function Home() {
  return (
    <div className="flex-1">
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
                className="object-cover object-right"
              />
              <div className="sky-worker absolute inset-0" />
              <div className="absolute inset-0 flex flex-col justify-start px-7 pt-10 text-brand md:px-12 md:pt-16">
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
                  问一问 →
                </span>
                <div className="mt-6 hidden text-xs tracking-widest text-brand/50 md:block">
                  14 部法规 · 678 条原文 · 口语提问也能查到依据
                </div>
              </div>
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
                className="object-cover object-right"
              />
              <div className="sky-enterprise absolute inset-0" />
              <div className="absolute inset-0 flex flex-col justify-start px-7 pt-10 text-white md:px-12 md:pt-16">
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
            </Link>

            {/* 中缝圆标：pointer-events-none，不挡两侧点击 */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-white text-lg font-medium text-brand shadow-lg">
                契
              </div>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          桌面端悬停任一侧可展开 · 移动端自动上下排列 · 剪影素材为本项目原创生成
        </p>
      </section>

      {/* 第二屏：slogan + 硬指标（评委要找的数字都在这里） */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 md:text-3xl">
            让每一份劳动合同，都经得起仲裁庭的检验
          </h2>
          <p className="mt-3 text-center text-slate-500">
            不是「能聊」，是「答得有出处、错了能算出来」。自建 40 题口语化评测集 + 3 份埋坑合同，每一层 RAG 都用数据说话。
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 p-6 text-center">
                <div className="text-3xl font-bold text-brand">{s.value}</div>
                <div className="mt-1 text-sm font-medium text-slate-700">
                  {s.label}
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 技术管线 */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-slate-900">
          技术管线
        </h2>
        <div className="mt-8 rounded-2xl bg-brand p-8 font-mono text-sm leading-relaxed text-white/90">
          <div>用户口语提问</div>
          <div className="text-white/50">↓</div>
          <div>口语→术语查询扩展（「一倍半」→「百分之一百五十」）</div>
          <div className="text-white/50">↓</div>
          <div>双路召回：bge-m3 向量 (0.8) + BM25 (0.2)</div>
          <div className="text-white/50">↓</div>
          <div>RRF 融合 → bge-reranker-v2-m3 重排</div>
          <div className="text-white/50">↓</div>
          <div>closed-set 强制引用 + 摘录逐字校验</div>
          <div className="text-white/50">↓</div>
          <div>带出处的回答 / 合同风险清单</div>
        </div>
      </section>
    </div>
  );
}
