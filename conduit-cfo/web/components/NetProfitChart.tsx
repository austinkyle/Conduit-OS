'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinancialSnapshot } from '../types';

export default function NetProfitChart({ snapshots }: { snapshots: FinancialSnapshot[] }) {
  if (snapshots.length === 0) return <section className="flex min-h-[260px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-sm text-slate-500">No financial snapshots yet.</section>;
  const data = snapshots.map((snapshot) => ({ date: snapshot.date.slice(5), netProfit: snapshot.netProfit, grossRevenue: snapshot.grossRevenue }));
  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">Net profit over time</h3>
    <p className="mt-1 text-xs text-slate-500">Daily net profit vs. gross revenue from the financial rollup</p>
    <div className="mt-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="netProfitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="netProfit" stroke="#f59e0b" strokeWidth={2} fill="url(#netProfitFill)" name="Net profit" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
