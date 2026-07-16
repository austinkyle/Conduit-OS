import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import TokenPicker from '../components/TokenPicker';
import './globals.css';

export const metadata: Metadata = { title: 'Conduit CFO — Executive Financial Cockpit' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body className="min-h-screen bg-slate-950 text-slate-100 antialiased"><div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.07),transparent_28%)]">
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 17l6-6 4 4 8-8M21 7v6h-6" /></svg></div><div><p className="text-sm font-bold tracking-wide text-white sm:text-base">conduit-cfo</p><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Executive Financial Cockpit</p></div></div><TokenPicker />
    </div></header>{children}
  </div></body></html>;
}
