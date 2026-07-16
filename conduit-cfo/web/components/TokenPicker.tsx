'use client';
import { useEffect, useState } from 'react';
import { currentToken, DEFAULT_TOKEN, DEMO_TOKENS, TOKEN_CHANGED_EVENT, type DemoToken } from '../lib/api';

export { TOKEN_CHANGED_EVENT };

export default function TokenPicker() {
  const [token, setToken] = useState<DemoToken>(DEFAULT_TOKEN);
  useEffect(() => setToken(currentToken()), []);
  function changeToken(next: DemoToken) {
    setToken(next);
    window.localStorage.setItem('conduit_cfo_token', next);
    window.dispatchEvent(new CustomEvent(TOKEN_CHANGED_EVENT));
  }
  return (
    <label className="flex items-center gap-3 text-sm text-slate-400">
      <span className="hidden sm:inline">Access role</span>
      <span className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" />
        <select aria-label="Demo access token" value={token} onChange={(event) => changeToken(event.target.value as DemoToken)} className="appearance-none rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-9 font-medium text-slate-200 outline-none transition hover:border-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20">
          {Object.entries(DEMO_TOKENS).map(([value, role]) => <option key={value} value={value}>{role}</option>)}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"><path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" /></svg>
      </span>
    </label>
  );
}
