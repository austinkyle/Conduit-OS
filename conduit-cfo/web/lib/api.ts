import type { DemoRole } from '../types';

export const DEMO_TOKENS = {
  tok_owner_demo: 'Owner', tok_admin_demo: 'Admin', tok_manager_demo: 'Manager', tok_viewer_demo: 'Viewer',
} as const satisfies Record<string, DemoRole>;
export type DemoToken = keyof typeof DEMO_TOKENS;
export const DEFAULT_TOKEN: DemoToken = 'tok_admin_demo';
export const TOKEN_CHANGED_EVENT = 'conduit-cfo-token-changed';

export function currentToken(): DemoToken {
  if (typeof window === 'undefined') return DEFAULT_TOKEN;
  const saved = window.localStorage.getItem('conduit_cfo_token');
  return saved && saved in DEMO_TOKENS ? (saved as DemoToken) : DEFAULT_TOKEN;
}
export function currentRole(): DemoRole { return DEMO_TOKENS[currentToken()]; }

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Authorization', `Bearer ${currentToken()}`);
  if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...opts, headers });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}
