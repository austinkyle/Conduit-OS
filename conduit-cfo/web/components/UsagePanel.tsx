import type { UsageSummaryResponse } from '../types';

const MODULE_STYLES: Record<string, string> = {
  core: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  reply: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  ops: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  cfo: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
};

function formatCost(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export default function UsagePanel({ usage }: { usage: UsageSummaryResponse }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-white">AI task usage & billing</h3>
        <p className="mt-1 text-xs text-slate-500">Cross-module Claude/agent task volume, last 30 days — the ledger every module writes to and Stripe meters against</p>
      </div>
      <div className="flex gap-4 text-right">
        <div><p className="text-xs uppercase tracking-widest text-slate-500">Total cost</p><p className="text-lg font-bold text-amber-300">{formatCost(usage.totalCostUsd)}</p></div>
        <div><p className="text-xs uppercase tracking-widest text-slate-500">Tasks</p><p className="text-lg font-bold text-slate-100">{usage.totalTasks.toLocaleString()}</p></div>
        <div><p className="text-xs uppercase tracking-widest text-slate-500">Pending billing sync</p><p className="text-lg font-bold text-slate-100">{usage.unreportedCount.toLocaleString()}</p></div>
      </div>
    </div>
    {usage.byModule.length === 0 ? <p className="mt-4 text-sm text-slate-500">No AI tasks recorded yet.</p> : <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
            <th className="pb-2 pr-4">Module</th>
            <th className="pb-2 pr-4">Task type</th>
            <th className="pb-2 pr-4">Count</th>
            <th className="pb-2 pr-4">Tokens (in/out)</th>
            <th className="pb-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {usage.byModule.map((row) => <tr key={`${row.module}:${row.taskType}`} className="border-t border-slate-800/60">
            <td className="py-2 pr-4"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${MODULE_STYLES[row.module] ?? 'border-slate-700 text-slate-400'}`}>{row.module}</span></td>
            <td className="py-2 pr-4 font-medium text-slate-200">{row.taskType}</td>
            <td className="py-2 pr-4 text-slate-400">{row.taskCount.toLocaleString()}</td>
            <td className="py-2 pr-4 text-slate-400">{row.tokensIn.toLocaleString()} / {row.tokensOut.toLocaleString()}</td>
            <td className="py-2 text-slate-200">{formatCost(row.totalCostUsd)}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
  </section>;
}
