'use client';

import { useCallback, useEffect, useState } from 'react';
import LedgerTable from '../components/LedgerTable';
import StatsCards from '../components/StatsCards';
import { TOKEN_CHANGED_EVENT } from '../components/TokenPicker';
import { apiFetch, currentRole } from '../lib/api';
import type { DemoRole, LedgerEvent, LedgerResponse, LedgerStatus } from '../types';

const EMPTY_DATA: LedgerResponse = { events: [], total: 0, counts: { pending: 0, processed: 0, failed: 0 } };
type Filter = 'All' | LedgerStatus;

export default function Home() {
  const [data, setData] = useState<LedgerResponse>(EMPTY_DATA);
  const [status, setStatus] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<DemoRole>('Admin');
  const [loading, setLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const loadEvents = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const params = new URLSearchParams({ limit: '100', offset: '0' });
    if (status !== 'All') params.set('status', status);
    if (query) params.set('q', query);
    try {
      setData(await apiFetch<LedgerResponse>(`/api/v1/ledger/events?${params.toString()}`));
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load ledger events.' });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [query, status]);

  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 400); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { loadEvents(); const timer = window.setInterval(() => loadEvents(true), 4000); return () => window.clearInterval(timer); }, [loadEvents]);
  useEffect(() => {
    setRole(currentRole());
    const changed = () => { setRole(currentRole()); setNotice(null); loadEvents(); };
    window.addEventListener(TOKEN_CHANGED_EVENT, changed);
    return () => window.removeEventListener(TOKEN_CHANGED_EVENT, changed);
  }, [loadEvents]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(timer); }, [notice]);

  async function replay(event: LedgerEvent) {
    if (!['Owner', 'Admin'].includes(role) || replayingId) return;
    setReplayingId(event.id);
    setData((current) => ({ ...current, events: current.events.map((item) => item.id === event.id ? { ...item, status: 'Pending' } : item) }));
    try {
      await apiFetch(`/api/v1/ledger/events/${encodeURIComponent(event.id)}/replay`, { method: 'POST' });
      setNotice({ kind: 'success', text: `${event.shopify_event_id} queued for replay.` });
    } catch (error) {
      const statusCode = (error as Error & { status?: number }).status;
      setNotice({ kind: 'error', text: statusCode === 403 ? 'This token cannot replay events. Switch to Owner or Admin.' : error instanceof Error ? error.message : 'Replay failed.' });
    } finally {
      setReplayingId(null);
      await loadEvents(true);
    }
  }

  const filters: Filter[] = ['All', 'Pending', 'Processed', 'Failed'];
  return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Operations workspace</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Event Ledger</h1><p className="mt-2 text-sm text-slate-400">Inspect ingestion activity, diagnose failures, and safely replay events.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Auto-refreshing every 4 seconds</div></div>
    <StatsCards total={data.total} counts={data.counts} />

    <section className="mt-6">
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" /></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event ID, topic, or payload…" aria-label="Search ledger" className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20" /></div>
        <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1">{filters.map((filter) => <button key={filter} onClick={() => setStatus(filter)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${status === filter ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-200'}`}>{filter}</button>)}</div><button onClick={() => loadEvents()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 disabled:opacity-60"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 11a8.1 8.1 0 00-15.5-2M4 4v5h5m-5 4a8.1 8.1 0 0015.5 2M20 20v-5h-5" /></svg>Refresh</button></div>
      </div>
      {loading && !data.events.length ? <div className="flex min-h-72 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500"><span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />Loading ledger…</div> : <LedgerTable events={data.events} canReplay={role === 'Owner' || role === 'Admin'} replayingId={replayingId} onReplay={replay} />}
    </section>
    {notice && <div role="status" className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl ${notice.kind === 'error' ? 'border-rose-400/30 bg-rose-950 text-rose-200' : 'border-emerald-400/30 bg-emerald-950 text-emerald-200'}`}>{notice.text}</div>}
  </main>;
}
