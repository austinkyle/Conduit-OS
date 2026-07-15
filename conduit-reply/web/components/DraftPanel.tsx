'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { ActionResponse, DemoRole, DraftResponse } from '../types';

type Props = { ticketId: string; disabled: boolean; onMessageSent: () => void; role: DemoRole };

export default function DraftPanel({ ticketId, disabled, onMessageSent, role }: Props) {
  const [draft, setDraft] = useState('');
  const [classification, setClassification] = useState<DraftResponse['classification'] | null>(null);
  const [source, setSource] = useState<DraftResponse['source'] | null>(null);
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => { setDraft(''); setClassification(null); setSource(null); setError(''); setStatus(''); }, [ticketId]);

  async function generateDraft() {
    if (disabled) return;
    setLoading('draft'); setError('');
    try { const data = await apiFetch<DraftResponse>(`/api/v1/crm/tickets/${ticketId}/generate-draft`, { method: 'POST' }); setDraft(data.draft); setClassification(data.classification); setSource(data.source); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not generate draft'); }
    finally { setLoading(null); }
  }
  async function sendMessage() {
    if (disabled || !draft.trim()) return;
    setLoading('send'); setError('');
    try { await apiFetch(`/api/v1/crm/tickets/${ticketId}/messages`, { method: 'POST', body: JSON.stringify({ body: draft }) }); setDraft(''); setClassification(null); setSource(null); onMessageSent(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send message'); }
    finally { setLoading(null); }
  }
  async function execute(action: 'cancel_order' | 'update_shipping_address') {
    if (disabled || role === 'Viewer' || !orderId.trim()) return;
    setLoading(action); setError(''); setStatus('');
    try { const data = await apiFetch<ActionResponse>(`/api/v1/crm/tickets/${ticketId}/execute-action`, { method: 'POST', body: JSON.stringify({ action, externalOrderId: orderId, newAddress: {} }) }); setStatus(data.result.detail); onMessageSent(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not execute action'); }
    finally { setLoading(null); }
  }

  const busy = loading !== null;
  return <aside className="flex min-h-[520px] flex-col rounded-xl border border-slate-800 bg-slate-900/70 lg:w-[30%]">
    <div className="border-b border-slate-800 p-4"><h2 className="font-bold text-white">Agent Copilot</h2><p className="mt-1 text-xs text-slate-500">Draft, revise, send, and act</p></div>
    <div className="space-y-5 p-4">
      <button onClick={generateDraft} disabled={disabled || busy} className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40">{loading === 'draft' ? 'Generating…' : 'Generate Draft'}</button>
      {(classification || source) && <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">{classification && <><span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">{classification.category}</span><span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-300">{classification.sentiment}</span></>}{source && <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300">{source}</span>}</div>}
      <textarea aria-label="Reply draft" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={disabled} placeholder="Generate a draft or write a reply…" className="min-h-44 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-40" />
      <button onClick={sendMessage} disabled={disabled || busy || !draft.trim()} className="w-full rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40">{loading === 'send' ? 'Sending…' : 'Send'}</button>
      <div className="border-t border-slate-800 pt-5"><h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">1-click Execute</h3>{role === 'Viewer' ? <p className="mt-3 text-xs text-slate-500">Actions are unavailable to Viewer accounts.</p> : <div className="mt-3 space-y-3"><input value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={disabled} placeholder="External order ID" className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500 disabled:opacity-40" /><div className="grid grid-cols-2 gap-2"><button onClick={() => execute('cancel_order')} disabled={disabled || busy || !orderId.trim()} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-xs font-bold text-rose-300 disabled:opacity-40">Cancel Order</button><button onClick={() => execute('update_shipping_address')} disabled={disabled || busy || !orderId.trim()} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-bold text-amber-300 disabled:opacity-40">Update Shipping Address</button></div></div>}</div>
      {status && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">{status}</p>}{error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
    </div>
  </aside>;
}
