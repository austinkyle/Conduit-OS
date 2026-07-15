export type DemoRole = 'Owner' | 'Admin' | 'Manager' | 'Viewer';

export interface Ticket {
  id: string; customerId: string | null; channel: 'Email' | 'SMS'; status: 'Open' | 'Pending_Human' | 'Closed';
  sentiment: string | null; category: string | null; summary: string | null; createdAt: string; updatedAt: string;
}
export interface Message {
  id: string; ticketId: string; senderType: 'Customer' | 'Human_Agent' | 'AI_Agent'; body: string; createdAt: string;
}
export interface TicketListResponse { tickets: Ticket[]; total: number; counts: { open: number; pendingHuman: number; closed: number } }
export interface DraftResponse { draft: string; source: 'llm' | 'template'; classification: { category: string; sentiment: string; summary: string; source: 'llm' | 'heuristic' } }
export interface ActionResponse { result: { simulated: boolean; success: boolean; detail: string }; ticketClosed: boolean }
export interface StatsResponse { totalTickets: number; autoResolutionRate: number; handoffRatio: number; avgLatencyMs: number; totalLlmCostUsd: number }
