'use client';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import type { CopilotResult } from '../types';

const STATUS_STYLES: Record<string, string> = {
  Success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Rejected: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  Error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

export default function CopilotChat() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<CopilotResult[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await apiFetch<CopilotResult>('/api/v1/analytics/copilot/query', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });
      setHistory((prev) => [result, ...prev]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the copilot');
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <h3 className="text-sm font-bold text-white">Financial copilot</h3>
    <p className="mt-1 text-xs text-slate-500">Ask a question in plain English — it's compiled to SQL and run read-only</p>
    <form
      className="mt-4 flex gap-2"
      onSubmit={(event) => { event.preventDefault(); submit(); }}
    >
      <input
        type="text"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="What was our gross margin last week?"
        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
      />
      <button
        type="submit"
        disabled={pending || question.trim().length === 0}
        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Asking…' : 'Ask'}
      </button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
    <div className="mt-4 space-y-4">
      {history.map((entry, index) => <div key={index} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-200">{entry.question}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[entry.status]}`}>{entry.status}</span>
        </div>
        {entry.generatedSql && <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-400">{entry.generatedSql}</pre>}
        {entry.status === 'Success' && (
          <>
            <p className="mt-2 text-xs text-slate-500">{entry.rowCount} row{entry.rowCount === 1 ? '' : 's'}</p>
            {entry.rows.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[400px] text-left text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      {Object.keys(entry.rows[0]).map((key) => <th key={key} className="pb-1 pr-3 font-semibold uppercase tracking-wide">{key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {entry.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-800/60 text-slate-300">
                      {Object.keys(entry.rows[0]).map((key) => <td key={key} className="py-1 pr-3">{String(row[key])}</td>)}
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {(entry.status === 'Rejected' || entry.status === 'Error') && entry.errorDetail && (
          <p className="mt-2 text-xs text-rose-300">{entry.errorDetail}</p>
        )}
      </div>)}
    </div>
  </section>;
}
