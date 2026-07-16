import type { LtvCohort } from '../types';

const BUCKET_STYLES: Record<string, string> = {
  '30': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '60': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  '90': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  '90+': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

function intensity(value: number, max: number): number {
  if (max <= 0) return 0.08;
  return 0.12 + 0.68 * Math.min(1, value / max);
}

export default function CohortHeatmap({ cohorts }: { cohorts: LtvCohort[] }) {
  if (cohorts.length === 0) return <section className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-sm text-slate-500">No cohorts have closed their 60-day window yet.</section>;
  const maxRevenue = Math.max(...cohorts.flatMap((cohort) => [cohort.revenueM0, cohort.revenueM1, cohort.revenueM2]));
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">LTV cohorts</h3>
    <p className="mt-1 text-xs text-slate-500">Revenue by cohort month at M0/M1/M2, CAC payback bucket</p>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-widest text-slate-500">
            <th className="pb-2 pr-4">Cohort</th>
            <th className="pb-2 pr-4">Size</th>
            <th className="pb-2 pr-4">M0 revenue</th>
            <th className="pb-2 pr-4">M1 revenue</th>
            <th className="pb-2 pr-4">M2 revenue</th>
            <th className="pb-2 pr-4">CAC</th>
            <th className="pb-2">Payback</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => <tr key={cohort.cohortMonth} className="border-t border-slate-800/60">
            <td className="py-2 pr-4 font-medium text-slate-200">{cohort.cohortMonth.slice(0, 7)}</td>
            <td className="py-2 pr-4 text-slate-400">{cohort.cohortSize.toLocaleString()}</td>
            <td className="py-2 pr-4"><span className="inline-block rounded px-2 py-1 text-amber-200" style={{ backgroundColor: `rgba(245,158,11,${intensity(cohort.revenueM0, maxRevenue)})` }}>${cohort.revenueM0.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
            <td className="py-2 pr-4"><span className="inline-block rounded px-2 py-1 text-amber-200" style={{ backgroundColor: `rgba(245,158,11,${intensity(cohort.revenueM1, maxRevenue)})` }}>${cohort.revenueM1.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
            <td className="py-2 pr-4"><span className="inline-block rounded px-2 py-1 text-amber-200" style={{ backgroundColor: `rgba(245,158,11,${intensity(cohort.revenueM2, maxRevenue)})` }}>${cohort.revenueM2.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></td>
            <td className="py-2 pr-4 text-slate-400">${cohort.cac.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
            <td className="py-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${cohort.paybackBucket ? BUCKET_STYLES[cohort.paybackBucket] : 'border-slate-700 text-slate-500'}`}>{cohort.paybackBucket ?? '—'}d</span></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
