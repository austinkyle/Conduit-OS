const BASE_URL = (process.env.REPLY_API_URL || 'http://localhost:4001').replace(/\/$/, '');
const AUTH_HEADERS = { Authorization: 'Bearer tok_admin_demo' };
const SEEDED_TICKET_ID = '10000000-0000-0000-0000-000000000101';

interface Ticket { id: string; category: string | null; sentiment: string | null }
interface TicketResponse { ticket: Ticket; messages: unknown[] }
interface DraftResponse {
  draft: string;
  source: string;
  classification: { category: string; sentiment: string; summary: string; source: string };
}
interface ScenarioResult { name: string; passed: boolean; detail: string }

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...AUTH_HEADERS,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function createTicket(body: string): Promise<string> {
  const result = await requestJson<{ id: string }>('/api/v1/crm/tickets', {
    method: 'POST',
    body: JSON.stringify({ channel: 'Email', body }),
  });
  if (!result.id) throw new Error('Create-ticket response did not include an id');
  return result.id;
}

async function pollForClassification(ticketId: string): Promise<Ticket> {
  let ticket: Ticket | undefined;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await requestJson<TicketResponse>(`/api/v1/crm/tickets/${ticketId}`);
    ticket = result.ticket;
    if (ticket.category !== null) return ticket;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ticket) throw new Error('Ticket poll returned no ticket');
  return ticket;
}

async function runScenario(name: string, scenario: () => Promise<string>): Promise<ScenarioResult> {
  try {
    return { name, passed: true, detail: await scenario() };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    console.warn('WARNING: This eval is designed for the zero-API-key deterministic path; results may differ when API keys are set.');
  }

  const results: ScenarioResult[] = [];
  results.push(await runScenario('Order status lookup', async () => {
    const result = await requestJson<DraftResponse>(`/api/v1/crm/tickets/${SEEDED_TICKET_ID}/generate-draft`, { method: 'POST' });
    assert(result.source === 'template', `expected source template, received ${result.source}`);
    assert(result.draft.includes('1054'), 'draft did not contain order 1054');
    assert(result.draft.includes('1Z999AA10123456784'), 'draft did not contain the seeded tracking number');
    const orderIds = [...result.draft.matchAll(/(?:#|\border\s*#?\s*)(\d{3,6})\b/gi)].map((match) => match[1]);
    const unexpected = orderIds.filter((id) => id !== '1054');
    assert(unexpected.length === 0, `draft contained unexpected order number(s): ${unexpected.join(', ')}`);
    return 'template draft referenced order 1054 and its tracking number';
  }));

  results.push(await runScenario('Cancellation intent', async () => {
    const ticketId = await createTicket('I want to cancel my order right now, please help');
    const ticket = await pollForClassification(ticketId);
    assert(ticket.category === 'Cancellation', `expected Cancellation, received ${String(ticket.category)}`);
    return `ticket ${ticketId} classified as Cancellation`;
  }));

  results.push(await runScenario('Negative sentiment', async () => {
    const ticketId = await createTicket('This is unacceptable, I am extremely upset and frustrated with this service');
    const ticket = await pollForClassification(ticketId);
    assert(ticket.sentiment === 'Negative', `expected Negative, received ${String(ticket.sentiment)}`);
    return `ticket ${ticketId} classified with Negative sentiment`;
  }));

  results.push(await runScenario('Return intent classification + draft generation', async () => {
    // NOTE: with zero API keys, embeddings.ts falls back to a deterministic
    // SHA256-based vector with no semantic relationship to the source text
    // (documented in Task 2). Cosine-similarity KB retrieval is therefore not
    // guaranteed to surface the topically-correct policy doc without a real
    // embedding model, so this scenario asserts on deterministic heuristic
    // classification plus a well-formed template draft, not on which specific
    // KB snippet was retrieved.
    const ticketId = await createTicket('What is your policy on returning an item for a refund?');
    const ticket = await pollForClassification(ticketId);
    assert(ticket.category === 'Returns', `expected Returns, received ${String(ticket.category)}`);
    const result = await requestJson<DraftResponse>(`/api/v1/crm/tickets/${ticketId}/generate-draft`, { method: 'POST' });
    assert(result.source === 'template', `expected template draft, received ${result.source}`);
    assert(result.draft.length > 0, 'draft was empty');
    return `ticket ${ticketId} classified as Returns with a well-formed template draft`;
  }));

  console.log('\n========== REPLY SCENARIO EVAL ==========');
  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}`);
  const passed = results.filter((result) => result.passed).length;
  console.log(`Summary: ${passed}/4 scenarios passed`);
  console.log('=========================================');
  process.exitCode = passed === 4 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Scenario eval failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
