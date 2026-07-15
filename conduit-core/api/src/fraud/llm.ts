import type { FraudResult, ShopifyOrderLike } from './scorer.js';

interface LLMOrderLike extends ShopifyOrderLike {
  line_items?: unknown[] | null;
}

export async function escalateWithLLM(
  payload: LLMOrderLike,
  heuristic: FraudResult,
): Promise<{ verdict: string; rationale: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const order = {
      total_price: payload.total_price,
      currency: payload.currency,
      email: payload.email,
      billing_address: payload.billing_address,
      shipping_address: payload.shipping_address,
      line_item_count: Array.isArray(payload.line_items) ? payload.line_items.length : 0,
      heuristic,
    };
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Assess this order for fraud. Reply with exactly one verdict (LEGITIMATE, SUSPICIOUS, or FRAUDULENT) on the first line and a one-sentence rationale on the second line. Order: ${JSON.stringify(order)}`,
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);

    const body = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = body.content?.find((item) => item.type === 'text')?.text?.trim();
    if (!text) throw new Error('Anthropic API returned no text');

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const verdictMatch = lines[0]?.match(/\b(LEGITIMATE|SUSPICIOUS|FRAUDULENT)\b/i);
    if (!verdictMatch) throw new Error('Anthropic API returned an invalid verdict');
    const verdict = verdictMatch[1]!.toUpperCase();
    const rationale = lines.slice(1).join(' ').trim();
    if (!rationale) throw new Error('Anthropic API returned no rationale');
    return { verdict, rationale };
  } catch (error) {
    console.warn('LLM fraud escalation failed', error);
    return null;
  }
}
