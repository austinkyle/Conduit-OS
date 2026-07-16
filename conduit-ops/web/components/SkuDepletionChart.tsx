'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { InventoryAlert } from '../types';

function buildSeries(alert: InventoryAlert) {
  const depletionDate = alert.predictedDepletionDate ? new Date(alert.predictedDepletionDate) : null;
  const today = new Date();
  const daysOut = depletionDate ? Math.max(1, Math.round((depletionDate.getTime() - today.getTime()) / 86_400_000)) : 14;
  const dailyBurn = alert.inventoryQty / daysOut;
  const points = [];
  for (let day = 0; day <= daysOut; day += Math.max(1, Math.round(daysOut / 10))) {
    const projected = Math.max(0, Math.round(alert.inventoryQty - dailyBurn * day));
    points.push({ day: `+${day}d`, actual: day === 0 ? alert.inventoryQty : null, projected, safetyStock: alert.safetyStockLimit });
  }
  return points;
}

export default function SkuDepletionChart({ alert }: { alert: InventoryAlert | null }) {
  if (!alert) return <section className="flex min-h-[260px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-sm text-slate-500">Select a SKU to view its depletion curve.</section>;
  const data = buildSeries(alert);
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">{alert.title} — projected depletion</h3>
    <p className="mt-1 text-xs text-slate-500">Actual vs. projected inventory, safety stock threshold overlaid</p>
    <div className="mt-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="projected" stroke="#38bdf8" strokeWidth={2} dot={false} name="Projected inventory" />
          <Line type="monotone" dataKey="safetyStock" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Safety stock" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
