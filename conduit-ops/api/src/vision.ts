export interface InvoiceLineItem {
  sku: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export interface InvoiceParseResult {
  source: 'claude-vision' | 'template';
  lineItems: InvoiceLineItem[];
}

// Deterministic fallback for when ANTHROPIC_API_KEY is unset or the vision call fails.
// Expects plain-text invoices with lines of the form "SKU  Description  qty x unitCost",
// which is what the demo simulator and eval scenarios generate. Real photographed/scanned
// invoices with no matching lines simply yield zero line items rather than throwing.
function parseWithTemplate(rawText: string): InvoiceParseResult {
  const lineItems: InvoiceLineItem[] = [];
  const pattern = /^([A-Z0-9-]+)\s+(.+?)\s+(\d+)\s*x\s*\$?([\d.]+)\s*$/;
  for (const line of rawText.split(/\r?\n/)) {
    const match = line.trim().match(pattern);
    if (!match) continue;
    const [, sku, description, quantity, unitCost] = match;
    lineItems.push({
      sku: sku!,
      description: description!.trim(),
      quantity: Number(quantity),
      unitCost: Number(unitCost),
    });
  }
  return { source: 'template', lineItems };
}

export async function parseInvoice(
  fileBuffer: Buffer,
  mimeType: string,
  rawTextFallback: string,
): Promise<InvoiceParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !mimeType.startsWith('image/')) return parseWithTemplate(rawTextFallback);

  try {
    const base64 = fileBuffer.toString('base64');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Extract every line item from this supplier invoice. Reply with ONLY a JSON array, no prose, where each element is {"sku": string, "description": string, "quantity": number, "unitCost": number}.',
            },
          ],
        }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);

    const body = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = body.content?.find((item) => item.type === 'text')?.text?.trim();
    if (!text) throw new Error('Anthropic API returned no text');

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Anthropic API returned no JSON array');
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Anthropic API returned malformed line items');

    const lineItems: InvoiceLineItem[] = parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        sku: String(item.sku ?? ''),
        description: String(item.description ?? ''),
        quantity: Number(item.quantity ?? 0),
        unitCost: Number(item.unitCost ?? 0),
      }))
      .filter((item) => item.sku.length > 0);

    if (lineItems.length === 0) throw new Error('Anthropic API returned zero usable line items');
    return { source: 'claude-vision', lineItems };
  } catch (error) {
    console.warn('Claude vision invoice parse failed, using template fallback', error);
    return parseWithTemplate(rawTextFallback);
  }
}
