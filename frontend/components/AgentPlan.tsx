/**
 * Agent 执行计划卡。
 *
 * steps 来自模型通过 plan_tasks 工具自主登记的内容，后端不预置模板、不拼步骤。
 * 把它单独展示出来，是为了让「规划」这一层能力可被评委直接核验，
 * 而不是只藏在模型的隐式推理里。
 */
export function AgentPlan({ goal, steps }: { goal: string; steps: string[] }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-900">
        <span>🧭</span> Agent 执行计划
        <span className="ml-auto text-xs font-normal text-indigo-500">
          {steps.length} 步 · 模型自主生成
        </span>
      </div>
      {goal && <p className="mt-2 text-xs text-indigo-700">目标：{goal}</p>}
      <ol className="mt-3 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm text-indigo-900">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[11px] font-medium">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 text-[11px] text-indigo-500">
        计划由模型在调用其他工具前自行登记，后端只做长度约束与透传
      </div>
    </div>
  );
}
