function highlightedJson(payload: unknown): string {
  const raw = JSON.stringify(payload, null, 2) ?? 'null';
  const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tokens = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
  return escaped.replace(tokens, (match, quoted: string | undefined, colon: string | undefined, literal: string | undefined) => {
    if (quoted) return `<span class="${colon ? 'text-sky-300' : 'text-emerald-300'}">${quoted}</span>${colon || ''}`;
    if (literal) return `<span class="text-purple-300">${match}</span>`;
    return `<span class="text-amber-300">${match}</span>`;
  });
}

export default function JsonViewer({ payload }: { payload: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-300 shadow-inner sm:text-sm" dangerouslySetInnerHTML={{ __html: highlightedJson(payload) }} />;
}
