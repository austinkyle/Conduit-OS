import { performance } from 'node:perf_hooks';

const BASE_URL = (process.env.REPLY_API_URL || 'http://localhost:4001').replace(/\/$/, '');
const COUNT = Number(process.env.SIM_TICKETS ?? 50);
const P95_THRESHOLD_MS = Number(process.env.SIM_P95_THRESHOLD_MS ?? 2000);
const CONCURRENCY = 10;
const AUTH_HEADERS = { Authorization: 'Bearer tok_admin_demo', 'content-type': 'application/json' };

interface DeliveryResult { success: boolean; latencyMs: number; error?: string }

const bodies = [
  'Where is my order? The tracking has not updated yet.',
  'Can you tell me when my package will be delivered?',
  'I want to cancel my order right now, please help.',
  'Please cancel this purchase before it ships.',
  'What is your return policy for an item I no longer want?',
  'I need to return an unworn item for a refund.',
] as const;

async function sendTicket(index: number): Promise<DeliveryResult> {
  const body = bodies[Math.floor(Math.random() * bodies.length)]!;
  const started = performance.now();
  try {
    const response = await fetch(`${BASE_URL}/api/v1/crm/tickets`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        customerId: `sim_customer_${index}`,
        channel: index % 4 === 0 ? 'SMS' : 'Email',
        body,
      }),
    });
    const latencyMs = performance.now() - started;
    const text = await response.text();
    if (!response.ok) return { success: false, latencyMs, error: `${response.status}: ${text}` };
    return { success: true, latencyMs };
  } catch (error) {
    return {
      success: false,
      latencyMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]!);
    }
  }
  // Cap concurrency at 10 to sustain load without opening every connection at once.
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)] ?? 0;
}

async function getStats(): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/api/v1/crm/stats`, {
    headers: { Authorization: AUTH_HEADERS.Authorization },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Stats request returned ${response.status}: ${text}`);
  return JSON.parse(text) as unknown;
}

async function main(): Promise<void> {
  if (!Number.isInteger(COUNT) || COUNT < 1) throw new Error('SIM_TICKETS must be a positive integer');
  if (!Number.isFinite(P95_THRESHOLD_MS) || P95_THRESHOLD_MS < 0) {
    throw new Error('SIM_P95_THRESHOLD_MS must be a non-negative number');
  }

  console.log(`Firing ${COUNT} synthetic tickets at ${BASE_URL} with concurrency ${CONCURRENCY}...`);
  const results = await mapConcurrent(Array.from({ length: COUNT }, (_, index) => index), CONCURRENCY, sendTicket);
  const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
  const successes = results.filter((result) => result.success).length;
  const failures = results.length - successes;
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const stats = await getStats();
  const passed = failures === 0 && p95 <= P95_THRESHOLD_MS;

  console.log('\n========== REPLY LOAD SIMULATION REPORT ==========');
  console.log(`Tickets fired:                 ${COUNT}`);
  console.log(`Successful / failed:           ${successes} / ${failures}`);
  console.log(`Ack latency p50/p95/p99 ms:    ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${p99.toFixed(1)}`);
  console.log(`p95 threshold ms:              ${P95_THRESHOLD_MS}`);
  console.log(`CRM stats:                     ${JSON.stringify(stats)}`);
  if (failures > 0) {
    const errors = results.filter((result) => !result.success).slice(0, 3).map((result) => result.error);
    console.log(`Sample failures:               ${errors.join(' | ')}`);
  }
  console.log(`Verdict:                       ${passed ? 'PASS' : 'FAIL'}`);
  console.log('==================================================');
  process.exitCode = passed ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Simulation failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
