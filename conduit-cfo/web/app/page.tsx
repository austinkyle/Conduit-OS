'use client';
import { useCallback, useEffect, useState } from 'react';
import CohortHeatmap from '../components/CohortHeatmap';
import CopilotChat from '../components/CopilotChat';
import NetProfitChart from '../components/NetProfitChart';
import StatsCards from '../components/StatsCards';
import UsagePanel from '../components/UsagePanel';
import { apiFetch, TOKEN_CHANGED_EVENT } from '../lib/api';
import type { CohortsResponse, FinancialSnapshot, LtvCohort, SnapshotsResponse, StatsResponse, UsageSummaryResponse } from '../types';

const emptyStats: StatsResponse = { netProfit: 0, grossMarginPct: 0, blendedMer: 0, blendedCac: 0, snapshotDate: null };
const emptyUsage: UsageSummaryResponse = { byModule: [], totalCostUsd: 0, totalTasks: 0, unreportedCount: 0 };

export default function Home() {
  const [snapshots, setSnapshots] = useState<FinancialSnapshot[]>([]);
  const [cohorts, setCohorts] = useState<LtvCohort[]>([]);
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [usage, setUsage] = useState<UsageSummaryResponse>(emptyUsage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOverview = useCallback(async () => {
    try {
      const [snapshotsRes, cohortsRes, statsRes, usageRes] = await Promise.all([
        apiFetch<SnapshotsResponse>('/api/v1/analytics/snapshots?days=60'),
        apiFetch<CohortsResponse>('/api/v1/analytics/cohorts'),
        apiFetch<StatsResponse>('/api/v1/analytics/stats'),
        apiFetch<UsageSummaryResponse>('/api/v1/usage/summary?days=30'),
      ]);
      setSnapshots(snapshotsRes.snapshots); setCohorts(cohortsRes.cohorts); setStats(statsRes); setUsage(usageRes); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load dashboard'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOverview(); const onTokenChange = () => fetchOverview(); window.addEventListener(TOKEN_CHANGED_EVENT, onTokenChange); return () => window.removeEventListener(TOKEN_CHANGED_EVENT, onTokenChange); }, [fetchOverview]);
  useEffect(() => { const timer = window.setInterval(fetchOverview, 5000); return () => window.clearInterval(timer); }, [fetchOverview]);

  return <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Executive Finance</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Executive Financial Cockpit</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Real-time net margin, blended ad efficiency, and LTV cohorts merged from every module in one place.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading financial data…</p> : <>
      <StatsCards stats={stats} />
      <NetProfitChart snapshots={snapshots} />
      <CohortHeatmap cohorts={cohorts} />
      <UsagePanel usage={usage} />
      <CopilotChat />
    </>}
  </main>;
}
