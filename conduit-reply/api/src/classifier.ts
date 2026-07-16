import { classifyTicket, type AnthropicUsage } from './llm.js';

export interface ClassificationResult {
  category: string;
  sentiment: string;
  summary: string;
  source: 'llm' | 'heuristic';
  usage?: AnthropicUsage;
}

export function classifyDeterministic(body: string): Omit<ClassificationResult, 'source'> {
  const text = typeof body === 'string' ? body : '';
  const lower = text.toLowerCase();

  let category = 'General';
  if (/\bcancel(?:lation|led|ing)?\b|cancel my order|don['’]t want/i.test(lower)) {
    category = 'Cancellation';
  } else if (/\breturn(?:ed|ing|s)?\b|\brefund(?:ed|ing|s)?\b|send back|\bexchange(?:d|s)?\b/i.test(lower)) {
    category = 'Returns';
  } else if (/where is|\btracking\b|\bshipped\b|\bdelivery\b|\barrive(?:d|s)?\b/i.test(lower)) {
    category = 'Shipping';
  }

  let sentiment = 'Neutral';
  if (/\bangry\b|\bfrustrated\b|\bterrible\b|\bunacceptable\b|\bworst\b|over a week|still waiting|!!|!.*!/i.test(lower)) {
    sentiment = 'Negative';
  } else if (/\bthank(?:s|ful)?\b|\bgreat\b|\blove\b|\bawesome\b/i.test(lower)) {
    sentiment = 'Positive';
  }

  const normalized = text.trim().replace(/\s+/g, ' ');
  const summary = normalized.length > 100 ? `${normalized.slice(0, 100)}...` : normalized;
  return { category, sentiment, summary };
}

export async function classifyTicketBody(body: string): Promise<ClassificationResult> {
  const heuristic = classifyDeterministic(body);
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const result = await classifyTicket(body);
      if (result) return { ...result, source: 'llm' };
    }
  } catch {
    // The deterministic result is the mandatory safety net.
  }
  return { ...heuristic, source: 'heuristic' };
}
