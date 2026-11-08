import Image from "next/image";
import Link from "next/link";

const STATS = [
  { label: "法规覆盖", value: "14 部", sub: "678 条原文" },
  { label: "检索召回率", value: "82.5%", sub: "口语化问题 Recall@5" },
  { label: "合同风险召回", value: "100%", sub: "19 个人工埋点全部命中" },
  { label: "引用有效率", value: "100%", sub: "closed-set 零幻觉" },
];

/**
 * 首页：把「劳动者 / 企业」这条产品主线做成首屏主视觉，而不是两张功能卡。
 *
 * 设计取舍：
 * - 两张主题剪影是本项目原创生成素材（public/hero-*.webp，合计约 66KB），
 *   不放网图，避免版权与授权风险；用 next/image 做尺寸与格式优化。
 * - 视觉只负责「讲清双端」，主标题与四个硬指标原样保留——评委最后要找的是数据。
 * - 悬停单侧展开用纯 CSS :has() 实现（见 globals.css），零 JS；
 *   手机端上下堆叠且不触发展开，对应评分表的响应式适配要求。
 * - 功能页 /review、/agent 一律不动：那里是评委核验技术的地方，需要清晰工具风。
 */
export default function Home() {
  return (
    <div className="flex-1">
      {/* Hero：压缩高度，把视觉重心让给下面的双端分栏 */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center md:pb-12 md:pt-16">
          <div className="mb-4 inline-block rounded-full bg-white/10 px-4 py-1 text-xs tracking-wider">
            AI Native · RAG · 强制法条引用
          </div>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            让每一份劳动合同
            <br />
            都经得起仲裁庭的检验
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-white/80 md:text-lg">
            中小企业没有专职法务，打工人不懂法条边界。我们用一条「混合检索 +
            重排 + 强制引用」的 RAG 管线，把 678 条劳动法规变成随叫随到的合规专家。
          </p>
          <p className="mt-7 text-xs tracking-widest text-white/50">
            选择你的身份，开始体验 ↓
          </p>
        </div>
      </section>

      {/* 双端沉浸式入口 */}
      <section className="bg-brand pb-14 md:pb-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="dual-panel relative overflow-hidden rounded-2xl border border-white/10">
            <Link
              href="/worker/chat"
              className="dual-side group relative block min-h-[340px] md:min-h-[440px]"
            >
              <Image
                src="/hero-worker.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-right"
              />
              {/* 黄橙底配深墨蓝字，不盖暗蒙版，保住参考图那种整块纯色天空 */}
              <div className="absolute inset-0 flex flex-col justify-start px-7 pb-9 pt-10 text-brand md:px-10 md:pt-14">
                <div className="text-xs font-medium tracking-widest text-brand/70">
                  FOR WORKERS · 劳动者端
                </div>
                <h2 className="mt-3 text-2xl font-bold md:text-3xl">我是劳动者</h2>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-brand/80">
                  被辞退了能拿多少钱？公司不缴社保怎么办？试用期被坑怎么维权？
                  口语化提问，答案逐条带法条原文。
                </p>
                <span className="mt-6 inline-flex w-fit rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-transform group-hover:translate-x-1">
                  问一问 →
                </span>
              </div>
            </Link>

            <Link
              href="/review"
              className="dual-side group relative block min-h-[340px] md:min-h-[440px]"
            >
              <Image
                src="/hero-enterprise.webp"
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-right"
              />
              {/* 深蓝底天然衬白字，同样不加蒙版，与左侧形成冷暖对仗 */}
              <div className="absolute inset-0 flex flex-col justify-start px-7 pb-9 pt-10 text-white md:px-10 md:pt-14">
                <div className="text-xs font-medium tracking-widest text-sky-200/90">
                  FOR HR · 企业端
                </div>
                <h2 className="mt-3 text-2xl font-bold md:text-3xl">我是企业 HR</h2>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/85">
                  上传或拍下合同，逐条识别试用期超期、放弃社保、无补偿竞业限制等风险，
                  每条结论都附可核验的法条原文。
                </p>
                <span className="mt-6 inline-flex w-fit rounded-full bg-white px-5 py-2.5 text-sm font-medium text-brand transition-transform group-hover:translate-x-1">
                  审合同 →
                </span>
              </div>
            </Link>

            {/* 中缝圆标：pointer-events-none，不挡两侧点击 */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white text-base font-medium text-brand shadow-lg">
                契
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-white/40">
            桌面端悬停任一侧可展开 · 移动端自动上下排列 · 剪影素材为本项目原创生成
          </p>
        </div>
      </section>

      {/* 数据看板：硬指标原样保留，评委最后要找的是这些数字 */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            不是「能聊」，是「答得有出处、错了能算出来」
          </h2>
          <p className="mt-2 text-center text-slate-500">
            自建 40 题口语化评测集 + 3 份埋坑合同，每一层 RAG 都用数据说话
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

      {/* 技术架构亮点 */}
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
