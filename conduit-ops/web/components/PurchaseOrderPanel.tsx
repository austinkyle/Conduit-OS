'use client';
import type { DemoRole, PurchaseOrder } from '../types';

type Props = { purchaseOrders: PurchaseOrder[]; role: DemoRole; onTransition: (id: string, status: 'Sent' | 'Received' | 'Closed') => void };
const statusStyle = { Draft: 'border-slate-500/20 bg-slate-500/10 text-slate-300', Sent: 'border-sky-400/20 bg-sky-400/10 text-sky-300', Received: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', Closed: 'border-slate-600/20 bg-slate-600/10 text-slate-400' };
const nextStatus: Record<PurchaseOrder['status'], 'Sent' | 'Received' | 'Closed' | null> = { Draft: 'Sent', Sent: 'Received', Received: 'Closed', Closed: null };

export default function PurchaseOrderPanel({ purchaseOrders, role, onTransition }: Props) {
  const canManage = role === 'Owner' || role === 'Admin';
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">Purchase Orders</h3>
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{purchaseOrders.length === 0 ? <p className="text-sm text-slate-500">No purchase orders yet.</p> : purchaseOrders.map((po) => {
      const next = nextStatus[po.status];
      return <div key={po.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-mono text-slate-400">{po.id.slice(0, 8)}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusStyle[po.status]}`}>{po.status}</span>
        </div>
        <p className="mt-2 text-sm text-slate-200">{po.items.length} item{po.items.length === 1 ? '' : 's'} · ${po.totalAmount.toFixed(2)}</p>
        {canManage && next && <button onClick={() => onTransition(po.id, next)} className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20">Mark {next}</button>}
      </div>;
    })}</div>
  </section>;
}
