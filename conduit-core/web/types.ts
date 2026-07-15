export type LedgerStatus = 'Pending' | 'Processed' | 'Failed';

export interface LedgerEvent {
  id: string;
  tenant_id: string;
  shopify_event_id: string;
  topic: string;
  payload: unknown;
  status: LedgerStatus;
  attempts: number;
  last_error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface LedgerResponse {
  events: LedgerEvent[];
  total: number;
  counts: { pending: number; processed: number; failed: number };
}

export type DemoRole = 'Owner' | 'Admin' | 'Manager' | 'Viewer';
