import Link from "next/link";

const STATS = [
  { label: "法规覆盖", value: "14 部", sub: "678 条原文" },
  { label: "检索召回率", value: "82.5%", sub: "口语化问题 Recall@5" },
  { label: "合同风险召回", value: "100%", sub: "19 个人工埋点全部命中" },
  { label: "引用有效率", value: "100%", sub: "closed-set 零幻觉" },
];

export default function Home() {
  return (
    <div className="flex-1">
      {/* Hero */}
      <section className="bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="mb-4 inline-block rounded-full bg-white/10 px-4 py-1 text-xs tracking-wider">
            AI Native · RAG · 强制法条引用
          </div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            让每一份劳动合同
            <br />
            都经得起仲裁庭的检验
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-white/80 md:text-lg">
            中小企业没有专职法务，打工人不懂法条边界。我们用一条「混合检索 +
            重排 + 强制引用」的 RAG 管线，把 678 条劳动法规变成随叫随到的合规专家。
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/worker/chat"
              className="rounded-full bg-worker px-6 py-3 font-medium hover:opacity-90"
            >
              我是劳动者，问一问 →
            </Link>
            <Link
              href="/review"
              className="rounded-full bg-white px-6 py-3 font-medium text-brand hover:bg-slate-100"
            >
              我是企业，审合同 →
            </Link>
          </div>
        </div>
      </section>

      {/* 双端入口 */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/worker/chat"
            className="group rounded-2xl border-2 border-transparent bg-white p-8 shadow-sm transition-all hover:border-worker hover:shadow-md"
          >
            <div className="text-4xl">💬</div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">劳动者版</h2>
            <p className="mt-2 text-slate-600">
              被辞退了能拿多少钱？公司不缴社保怎么办？试用期被坑怎么维权？
              口语化提问，答案逐条带法条原文。
            </p>
            <div className="mt-4 text-sm font-medium text-worker">
              开始提问 →
            </div>
          </Link>

          <Link
            href="/review"
            className="group rounded-2xl border-2 border-transparent bg-white p-8 shadow-sm transition-all hover:border-brand hover:shadow-md"
          >
            <div className="text-4xl">📄</div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">合同风险审查</h2>
            <p className="mt-2 text-slate-600">
              不管你是 HR 还是刚签合同的打工人，把合同贴进来，
              逐条识别试用期超期、放弃社保、无补偿竞业限制等风险。
            </p>
            <div className="mt-4 text-sm font-medium text-brand">
              粘贴合同审查 →
            </div>
          </Link>
        </div>
      </section>

      {/* 数据看板 */}
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
