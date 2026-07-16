import { scrubPii } from './pii.js';

export interface AnthropicUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ClassifyResult {
  category: string;
  sentiment: string;
  summary: string;
  usage: AnthropicUsage;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function requestAnthropic(prompt: string, maxTokens: number): Promise<{ text: string; usage: AnthropicUsage }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);
  const body = await response.json() as AnthropicResponse;
  const text = body.content?.find((item) => item.type === 'text')?.text?.trim();
  if (!text) throw new Error('Anthropic API returned no text');
  return { text, usage: { inputTokens: body.usage?.input_tokens, outputTokens: body.usage?.output_tokens } };
}

export async function classifyTicket(messageBody: string): Promise<ClassifyResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const message = scrubPii(messageBody);
    const { text, usage } = await requestAnthropic(
      `Classify this customer support message. Reply with exactly three non-empty lines in this format:\nCategory: <Shipping|Returns|Cancellation|General>\nSentiment: <Positive|Neutral|Negative>\nSummary: <one-sentence summary>\n\nMessage:\n${message}`,
      300,
    );
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length !== 3) throw new Error('Malformed classification response');

    const category = lines[0]?.match(/^Category:\s*(Shipping|Returns|Cancellation|General)$/i)?.[1];
    const sentiment = lines[1]?.match(/^Sentiment:\s*(Positive|Neutral|Negative)$/i)?.[1];
    const summary = lines[2]?.match(/^Summary:\s*(.+)$/i)?.[1]?.trim();
    if (!category || !sentiment || !summary) throw new Error('Malformed classification fields');

    return { category, sentiment, summary, usage };
  } catch (error) {
    console.warn('LLM ticket classification failed', error);
    return null;
  }
}

export async function generateDraftReply(prompt: string): Promise<{ text: string; usage: AnthropicUsage } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    return await requestAnthropic(scrubPii(prompt), 500);
  } catch (error) {
    console.warn('LLM draft reply generation failed', error);
    return null;
  }
}
