import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import TokenPicker from '../components/TokenPicker';
import './globals.css';

export const metadata: Metadata = { title: 'conduit-ops — Predictive Supply Chain' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body className="min-h-screen bg-slate-950 text-slate-100 antialiased"><div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.07),transparent_28%)]">
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 3h18v6H3V3zm2 8h14v10H5V11zm3 3h2m4 0h2" /></svg></div><div><p className="text-sm font-bold tracking-wide text-white sm:text-base">conduit-ops</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Predictive Supply Chain &amp; ERP</p></div></div><TokenPicker />
    </div></header>{children}
  </div></body></html>;
}
