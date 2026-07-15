'use client';

import { Fragment, useState } from 'react';
import type { LedgerEvent } from '../types';
import JsonViewer from './JsonViewer';
import StatusBadge from './StatusBadge';

interface Props {
  events: LedgerEvent[];
  canReplay: boolean;
  replayingId: string | null;
  onReplay: (event: LedgerEvent) => void;
}

function receivedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ReplayButton({ event, canReplay, busy, onReplay, compact = false }: { event: LedgerEvent; canReplay: boolean; busy: boolean; onReplay: (event: LedgerEvent) => void; compact?: boolean }) {
  return <button
    type="button"
    disabled={!canReplay || busy}
    title={canReplay ? `Replay ${event.shopify_event_id}` : 'Replay requires an Owner or Admin token'}
    onClick={(click) => { click.stopPropagation(); onReplay(event); }}
    className={`${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg border border-sky-400/30 bg-sky-400/10 font-semibold text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-500`}
  >{busy ? 'Replaying…' : 'Replay'}</button>;
}

export default function LedgerTable({ events, canReplay, replayingId, onReplay }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!events.length) return <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center">
    <div className="mb-4 rounded-full border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
    <h2 className="text-lg font-semibold text-slate-200">No events yet — fire the simulator</h2>
    <p className="mt-2 max-w-md text-sm text-slate-500">Incoming webhook events will appear here as soon as they reach the ingestion pipeline.</p>
  </div>;

  return <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-black/10">
    <table className="w-full min-w-[900px] border-collapse text-left text-sm">
      <thead><tr className="border-b border-slate-800 bg-slate-900/90 text-xs uppercase tracking-wider text-slate-500">
        <th className="px-5 py-4 font-semibold">Event ID</th><th className="px-5 py-4 font-semibold">Topic</th><th className="px-5 py-4 font-semibold">Status</th><th className="px-5 py-4 text-center font-semibold">Attempts</th><th className="px-5 py-4 font-semibold">Received</th><th className="px-5 py-4 text-right font-semibold">Actions</th>
      </tr></thead>
      <tbody>{events.map((event) => {
        const isOpen = expanded === event.id;
        return <Fragment key={event.id}>
          <tr onClick={() => setExpanded(isOpen ? null : event.id)} aria-expanded={isOpen} className="cursor-pointer border-b border-slate-800/80 text-slate-300 transition hover:bg-slate-800/40">
            <td className="px-5 py-4"><span className="mr-2 inline-block text-slate-600 transition">{isOpen ? '▾' : '▸'}</span><span className="font-mono text-xs text-slate-200">{event.shopify_event_id}</span></td>
            <td className="px-5 py-4"><span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-sky-300">{event.topic}</span></td>
            <td className="px-5 py-4"><StatusBadge status={event.status} /></td>
            <td className="px-5 py-4 text-center font-mono text-slate-400">{event.attempts}</td>
            <td className="whitespace-nowrap px-5 py-4 text-slate-400">{receivedLabel(event.received_at)}</td>
            <td className="px-5 py-4 text-right"><ReplayButton compact event={event} canReplay={canReplay} busy={replayingId === event.id} onReplay={onReplay} /></td>
          </tr>
          {isOpen && <tr className="border-b border-slate-800 bg-slate-950/50"><td colSpan={6} className="px-5 py-5 sm:px-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Event payload</p><p className="mt-1 font-mono text-xs text-slate-600">Internal ID: {event.id}</p></div><ReplayButton event={event} canReplay={canReplay} busy={replayingId === event.id} onReplay={onReplay} /></div>
            {event.last_error && <div className="mb-4 rounded-lg border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-300"><span className="font-semibold">Last error: </span>{event.last_error}</div>}
            <JsonViewer payload={event.payload} />
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}
