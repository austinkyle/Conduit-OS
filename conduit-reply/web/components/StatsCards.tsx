import type { StatsResponse } from '../types';

export default function StatsCards({ stats }: { stats: StatsResponse }) {
  const cards = [
    { label: 'Total Tickets', value: stats.totalTickets.toLocaleString(), accent: 'bg-sky-400', text: 'text-slate-100' },
    { label: 'Auto-Resolution Rate', value: `${(stats.autoResolutionRate * 100).toFixed(0)}%`, accent: 'bg-emerald-400', text: 'text-emerald-300' },
    { label: 'Handoff Ratio', value: `${(stats.handoffRatio * 100).toFixed(0)}%`, accent: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Avg Latency', value: `${stats.avgLatencyMs} ms`, accent: 'bg-violet-400', text: 'text-violet-300' },
    { label: 'LLM Cost', value: `$${stats.totalLlmCostUsd.toFixed(4)}`, accent: 'bg-rose-400', text: 'text-rose-300' },
  ];
  return <section aria-label="CRM statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map((card) => <div key={card.label} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/10"><span className={`absolute inset-y-0 left-0 w-1 ${card.accent}`} /><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{card.label}</p><p className={`mt-2 text-2xl font-bold tracking-tight ${card.text}`}>{card.value}</p></div>)}</section>;
}
