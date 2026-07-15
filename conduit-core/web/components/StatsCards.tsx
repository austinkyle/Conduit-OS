import type { LedgerResponse } from '../types';

type Props = Pick<LedgerResponse, 'total' | 'counts'>;

export default function StatsCards({ total, counts }: Props) {
  const cards = [
    { label: 'Total', value: total, accent: 'bg-sky-400', text: 'text-slate-100' },
    { label: 'Pending', value: counts.pending, accent: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Processed', value: counts.processed, accent: 'bg-emerald-400', text: 'text-emerald-300' },
    { label: 'Failed', value: counts.failed, accent: 'bg-rose-400', text: 'text-rose-300' },
  ];
  return <section aria-label="Ledger statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => (
    <div key={card.label} className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/10">
      <span className={`absolute inset-y-0 left-0 w-1 ${card.accent}`} />
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{card.label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${card.text}`}>{card.value.toLocaleString()}</p>
    </div>
  ))}</section>;
}
