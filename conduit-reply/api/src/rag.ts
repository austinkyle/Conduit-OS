import { withTenant } from './db.js';
import { embedText, toVectorLiteral } from './embeddings.js';

export interface OrderContext {
  externalOrderId: string;
  paymentStatus: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  estimatedDelivery: string | null;
}

export interface KnowledgeBaseSnippet {
  title: string;
  content: string;
  similarity: number;
}

export async function retrieveKnowledgeBase(tenantId: string, queryText: string, topK = 3): Promise<KnowledgeBaseSnippet[]> {
  try {
    const embedding = await embedText(queryText);
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ title: string; content: string; similarity: string | number }>(
        `SELECT title, content, 1 - (embedding <=> $1::vector) AS similarity
           FROM knowledge_base
          WHERE tenant_id = $2 AND embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $3`,
        [toVectorLiteral(embedding), tenantId, topK],
      );
      return result.rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
    });
  } catch {
    return [];
  }
}

export async function lookupOrderContext(tenantId: string, externalOrderId: string): Promise<OrderContext | null> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{
        external_order_id: string;
        payment_status: string | null;
        shipping_status: string | null;
        raw_data: Record<string, unknown> | null;
      }>(
        `SELECT external_order_id, payment_status, shipping_status, raw_data
           FROM orders
          WHERE tenant_id = $1 AND external_order_id = $2`,
        [tenantId, externalOrderId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const rawData = row.raw_data ?? {};
      const nullableString = (value: unknown): string | null => typeof value === 'string' ? value : null;
      return {
        externalOrderId: row.external_order_id,
        paymentStatus: row.payment_status,
        shippingStatus: row.shipping_status,
        trackingNumber: nullableString(rawData.tracking_number),
        carrier: nullableString(rawData.carrier),
        estimatedDelivery: nullableString(rawData.estimated_delivery),
      };
    });
  } catch {
    return null;
  }
}

export function buildDraftTemplate(
  orderContexts: OrderContext[],
  snippets: KnowledgeBaseSnippet[],
  classification: { category: string },
): string {
  const lines = ['Hello,', ''];

  for (const order of orderContexts) {
    let line = `Order #${order.externalOrderId}`;
    line += order.shippingStatus ? ` is currently ${order.shippingStatus}.` : '.';
    if (order.carrier && order.trackingNumber) {
      line += ` It's on its way via ${order.carrier} with tracking number ${order.trackingNumber}.`;
    } else if (order.trackingNumber) {
      line += ` Its tracking number is ${order.trackingNumber}.`;
    } else if (order.carrier) {
      line += ` The carrier is ${order.carrier}.`;
    }
    lines.push(line);
  }
  if (orderContexts.length > 0) lines.push('');

  if (snippets.length > 0) {
    lines.push(`Here is some relevant information for your ${classification.category.toLowerCase()} request:`);
    lines.push(snippets[0].content, '');
  }

  lines.push('Best,', 'Conduit Support');
  return lines.join('\n');
}
