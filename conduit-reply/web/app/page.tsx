'use client';
import { useCallback, useEffect, useState } from 'react';
import DraftPanel from '../components/DraftPanel';
import MessageThread from '../components/MessageThread';
import StatsCards from '../components/StatsCards';
import TicketList from '../components/TicketList';
import { apiFetch, currentRole, TOKEN_CHANGED_EVENT } from '../lib/api';
import type { DemoRole, Message, StatsResponse, Ticket, TicketListResponse } from '../types';

type DetailResponse = { ticket: Ticket; messages: Message[] };
const emptyStats: StatsResponse = { totalTickets: 0, autoResolutionRate: 0, handoffRatio: 0, avgLatencyMs: 0, totalLlmCostUsd: 0 };
const emptyCounts = { open: 0, pendingHuman: 0, closed: 0 };

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stats, setStats] = useState<StatsResponse>(emptyStats);
  const [role, setRole] = useState<DemoRole>('Admin');
  const [error, setError] = useState('');

  const fetchOverview = useCallback(async () => {
    try {
      const [list, nextStats] = await Promise.all([apiFetch<TicketListResponse>('/api/v1/crm/tickets'), apiFetch<StatsResponse>('/api/v1/crm/stats')]);
      setTickets(list.tickets); setCounts(list.counts); setStats(nextStats); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load workspace'); }
  }, []);
  const fetchDetail = useCallback(async (id: string) => {
    try { const detail = await apiFetch<DetailResponse>(`/api/v1/crm/tickets/${id}`); setSelectedTicket(detail.ticket); setMessages(detail.messages); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load ticket'); }
  }, []);
  const refreshSelected = useCallback(async () => { await Promise.all([fetchOverview(), selectedId ? fetchDetail(selectedId) : Promise.resolve()]); }, [fetchDetail, fetchOverview, selectedId]);

  useEffect(() => { setRole(currentRole()); fetchOverview(); const onTokenChange = () => { setRole(currentRole()); setSelectedId(null); setSelectedTicket(null); setMessages([]); fetchOverview(); }; window.addEventListener(TOKEN_CHANGED_EVENT, onTokenChange); return () => window.removeEventListener(TOKEN_CHANGED_EVENT, onTokenChange); }, [fetchOverview]);
  useEffect(() => { if (selectedId) fetchDetail(selectedId); }, [fetchDetail, selectedId]);
  useEffect(() => { const timer = window.setInterval(() => { fetchOverview(); if (selectedId) fetchDetail(selectedId); }, 4000); return () => window.clearInterval(timer); }, [fetchDetail, fetchOverview, selectedId]);

  function selectTicket(id: string) { setSelectedId(id); const ticket = tickets.find((item) => item.id === id) ?? null; setSelectedTicket(ticket); }

  return <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">CRM Operations</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Agent Copilot Workspace</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review customer conversations, generate grounded responses, and execute approved service actions from one workspace.</p></div>
    {error && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
    <StatsCards stats={stats} />
    {selectedTicket && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="font-semibold text-slate-200">Selected: {selectedTicket.customerId || 'Unknown customer'}</span>{selectedTicket.summary && <span className="truncate">— {selectedTicket.summary}</span>}</div>}
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch"><TicketList tickets={tickets} selectedId={selectedId} onSelect={selectTicket} counts={counts} /><MessageThread messages={messages} /><DraftPanel ticketId={selectedId ?? ''} disabled={!selectedId} onMessageSent={refreshSelected} role={role} /></div>
  </main>;
}
