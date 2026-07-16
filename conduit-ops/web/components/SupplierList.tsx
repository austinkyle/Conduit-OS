import type { Supplier } from '../types';

export default function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">Suppliers</h3>
    <div className="mt-3 space-y-2">{suppliers.length === 0 ? <p className="text-sm text-slate-500">No suppliers on file.</p> : suppliers.map((supplier) => (
      <div key={supplier.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-100">{supplier.name}</p><span className="shrink-0 text-[11px] text-slate-500">{supplier.lead_time_days}d lead</span></div>
        <p className="mt-1 truncate text-xs text-slate-400">{supplier.email}</p>
        <p className="mt-1 text-[11px] text-slate-600">MOQ {supplier.moq} units</p>
      </div>
    ))}</div>
  </section>;
}
