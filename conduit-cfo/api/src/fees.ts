import { getDailyRevenue } from './revenue.js';

export interface DailyFees {
  processingFees: number;
  source: 'stripe' | 'estimate';
}

interface StripeBalanceTransaction {
  fee?: number;
}

// Real (not simulated) Stripe Balance Transactions call, same raw-fetch style as vision.ts's
// Claude call — single page, best-effort. Falls back to the deterministic estimate below on any
// error so a bad/missing key never breaks the rollup.
async function fetchStripeFees(date: string): Promise<number | null> {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) return null;

  try {
    const dayStart = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const dayEnd = dayStart + 86_400;
    const params = new URLSearchParams({
      'created[gte]': String(dayStart),
      'created[lt]': String(dayEnd),
      type: 'charge',
      limit: '100',
    });
    const response = await fetch(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Stripe API returned ${response.status}`);

    const body = await response.json() as { data?: StripeBalanceTransaction[] };
    const feesCents = (body.data ?? []).reduce((sum, tx) => sum + (tx.fee ?? 0), 0);
    return Number((feesCents / 100).toFixed(2));
  } catch (error) {
    console.warn('conduit-cfo Stripe fee reconciliation failed, using estimate', error);
    return null;
  }
}

// 2.9% + $0.30/order is the standard blended card-processing estimate, used whenever
// STRIPE_API_KEY is unset or the live reconciliation call fails.
export async function getDailyProcessingFees(tenantId: string, date: string): Promise<DailyFees> {
  const stripeFees = await fetchStripeFees(date);
  if (stripeFees !== null) return { processingFees: stripeFees, source: 'stripe' };

  const { grossRevenue, orderCount } = await getDailyRevenue(tenantId, date);
  const processingFees = Number((grossRevenue * 0.029 + orderCount * 0.30).toFixed(2));
  return { processingFees, source: 'estimate' };
}
