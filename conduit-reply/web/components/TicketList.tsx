import type { Ticket } from '../types';

type Props = { tickets: Ticket[]; selectedId: string | null; onSelect: (id: string) => void; counts: { open: number; pendingHuman: number; closed: number } };
const statusStyle = { Open: 'border-sky-400/20 bg-sky-400/10 text-sky-300', Pending_Human: 'border-amber-400/20 bg-amber-400/10 text-amber-300', Closed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' };

export default function TicketList({ tickets, selectedId, onSelect, counts }: Props) {
  return <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 lg:w-[30%]">
    <div className="border-b border-slate-800 p-4"><h2 className="font-bold text-white">Tickets</h2><p className="mt-1 text-xs text-slate-500">{counts.open} open · {counts.pendingHuman} handoff · {counts.closed} closed</p></div>
    <div className="flex-1 overflow-y-auto p-2">{tickets.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No tickets found.</p> : tickets.map((ticket) => (
      <button key={ticket.id} onClick={() => onSelect(ticket.id)} className={`mb-2 w-full rounded-lg border p-3 text-left transition ${ticket.id === selectedId ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/60'}`}>
        <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-100">{ticket.customerId || 'Unknown customer'}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle[ticket.status]}`}>{ticket.status.replace('_', ' ')}</span></div>
        <div className="mt-2 flex items-center gap-2 text-xs"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{ticket.channel}</span>{ticket.category && <span className="truncate text-slate-400">{ticket.category}</span>}</div>
        <p className="mt-2 text-[11px] text-slate-600">{new Date(ticket.createdAt).toLocaleString()}</p>
      </button>
    ))}</div>
  </section>;
}
