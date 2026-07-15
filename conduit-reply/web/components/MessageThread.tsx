import type { Message } from '../types';

export default function MessageThread({ messages }: { messages: Message[] }) {
  return <section className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
    <div className="border-b border-slate-800 p-4"><h2 className="font-bold text-white">Conversation</h2><p className="mt-1 text-xs text-slate-500">Customer and agent message history</p></div>
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">{messages.length === 0 ? <div className="grid flex-1 place-items-center text-sm text-slate-500">Select a ticket to view its conversation.</div> : messages.map((message) => {
      const customer = message.senderType === 'Customer';
      const ai = message.senderType === 'AI_Agent';
      return <div key={message.id} className={`flex ${customer ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[85%] rounded-xl border px-4 py-3 ${customer ? 'border-slate-700 bg-slate-800 text-slate-200' : ai ? 'border-dashed border-emerald-500/50 bg-emerald-500/10 text-emerald-50' : 'border-sky-500/30 bg-sky-500/15 text-sky-50'}`}>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">{message.senderType.replace('_', ' ')}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p><p className="mt-2 text-right text-[10px] opacity-50">{new Date(message.createdAt).toLocaleString()}</p>
      </div></div>;
    })}</div>
  </section>;
}
