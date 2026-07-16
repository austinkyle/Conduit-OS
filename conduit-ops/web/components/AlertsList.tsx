import type { InventoryAlert } from '../types';

type Props = { alerts: InventoryAlert[]; selectedId: string | null; onSelect: (id: string) => void };

export default function AlertsList({ alerts, selectedId, onSelect }: Props) {
  return <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 lg:w-[32%]">
    <div className="border-b border-slate-800 p-4"><h2 className="font-bold text-white">Stock Alerts</h2><p className="mt-1 text-xs text-slate-500">{alerts.length} SKU{alerts.length === 1 ? '' : 's'} at or below safety stock</p></div>
    <div className="flex-1 overflow-y-auto p-2">{alerts.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No active alerts.</p> : alerts.map((alert) => {
      const depleted = alert.inventoryQty <= alert.safetyStockLimit;
      return <button key={alert.productId} onClick={() => onSelect(alert.productId)} className={`mb-2 w-full rounded-lg border p-3 text-left transition ${alert.productId === selectedId ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/60'}`}>
        <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-100">{alert.title}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${depleted ? 'border-rose-400/20 bg-rose-400/10 text-rose-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>{depleted ? 'BELOW SAFETY' : 'AT RISK'}</span></div>
        <div className="mt-2 flex items-center gap-2 text-xs"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{alert.sku}</span><span className="text-slate-400">{alert.inventoryQty} on hand · {alert.safetyStockLimit} safety limit</span></div>
        <p className="mt-2 text-[11px] text-slate-600">Suggested reorder: {alert.suggestedReorderQty} units · {(alert.confidenceScore * 100).toFixed(0)}% confidence{alert.predictedDepletionDate ? ` · depletes ${new Date(alert.predictedDepletionDate).toLocaleDateString()}` : ''}</p>
      </button>;
    })}</div>
  </section>;
}
