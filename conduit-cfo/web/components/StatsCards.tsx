import type { StatsResponse } from '../types';

export default function StatsCards({ stats }: { stats: StatsResponse }) {
  const cards = [
    { label: 'Net Profit (Latest)', value: `$${stats.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, accent: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Gross Margin', value: `${(stats.grossMarginPct * 100).toFixed(1)}%`, accent: 'bg-emerald-400', text: 'text-emerald-300' },
    { label: 'Blended MER', value: stats.blendedMer.toFixed(2), accent: 'bg-sky-400', text: 'text-slate-100' },
    { label: 'Blended CAC', value: `$${stats.blendedCac.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, accent: 'bg-violet-400', text: 'text-violet-300' },
  ];
  return <section aria-label="Financial statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <div key={card.label} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/10"><span className={`absolute inset-y-0 left-0 w-1 ${card.accent}`} /><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{card.label}</p><p className={`mt-2 text-2xl font-bold tracking-tight ${card.text}`}>{card.value}</p></div>)}</section>;
}
