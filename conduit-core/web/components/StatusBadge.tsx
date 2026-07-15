import type { LedgerStatus } from '../types';

const styles: Record<LedgerStatus, string> = {
  Pending: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  Processed: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  Failed: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
};
const dots: Record<LedgerStatus, string> = { Pending: 'bg-amber-400', Processed: 'bg-emerald-400', Failed: 'bg-rose-400' };

export default function StatusBadge({ status }: { status: LedgerStatus }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}><span className={`h-1.5 w-1.5 rounded-full ${dots[status]}`} />{status}</span>;
}
