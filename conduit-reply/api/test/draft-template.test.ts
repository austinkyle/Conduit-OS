import { describe, expect, it } from 'vitest';
import { buildDraftTemplate, type KnowledgeBaseSnippet, type OrderContext } from '../src/rag.js';

describe('buildDraftTemplate', () => {
  it('includes the seeded order id and tracking number', () => {
    const orders: OrderContext[] = [{
      externalOrderId: '1054',
      paymentStatus: 'paid',
      shippingStatus: 'in_transit',
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      estimatedDelivery: null,
    }];
    const snippets: KnowledgeBaseSnippet[] = [{
      title: 'Shipping & Tracking Policy',
      content: 'Customers can track an order using the carrier tracking number.',
      similarity: 0.95,
    }];

    const draft = buildDraftTemplate(orders, snippets, { category: 'Shipping' });

    expect(draft).toContain('1054');
    expect(draft).toContain('1Z999AA10123456784');
  });
});
