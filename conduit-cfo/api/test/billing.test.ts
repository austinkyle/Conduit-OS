import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportMeterEvent } from '../src/billing.js';

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_API_KEY;

const sampleRow = {
  id: 'row-1',
  task_type: 'copilot_query',
  cost_usd: '0.006000',
  created_at: '2026-07-15T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = ORIGINAL_STRIPE_KEY;
});

describe('reportMeterEvent', () => {
  it('logs a [simulated] line and never calls Stripe when STRIPE_API_KEY is unset', async () => {
    delete process.env.STRIPE_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await reportMeterEvent('tenant-1', sampleRow);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[simulated] Stripe meter event'));
    logSpy.mockRestore();
  });

  it('POSTs a meter event keyed by the usage row id when STRIPE_API_KEY is set', async () => {
    process.env.STRIPE_API_KEY = 'sk_test_123';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchSpy);

    await reportMeterEvent('tenant-1', sampleRow);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/billing/meter_events');
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>).authorization).toBe('Bearer sk_test_123');

    const body = new URLSearchParams(options.body as string);
    expect(body.get('identifier')).toBe('row-1');
    expect(body.get('payload[stripe_customer_id]')).toBe('tenant-1');
    expect(body.get('payload[value]')).toBe('0.006000');
  });

  it('throws when Stripe returns a non-ok response, leaving the row unmarked for the next sync', async () => {
    process.env.STRIPE_API_KEY = 'sk_test_123';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402 }));

    await expect(reportMeterEvent('tenant-1', sampleRow)).rejects.toThrow('402');
  });
});
