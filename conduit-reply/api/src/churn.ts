import { withTenant } from './db.js';
import { scrubPii } from './pii.js';
import { sendSms } from './sms.js';

export interface ChurnRiskCustomer {
  customerId: string;
  orderCount: number;
  daysSinceLastOrder: number;
}

export async function scanForChurnRisk(tenantId: string): Promise<ChurnRiskCustomer[]> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{
        customer_id: string;
        order_count: string | number;
        days_since_last_order: string | number;
      }>(
        `SELECT customer_id,
                COUNT(*) AS order_count,
                EXTRACT(DAY FROM now() - MAX(created_at))::int AS days_since_last_order
           FROM orders
          WHERE tenant_id = $1
          GROUP BY customer_id
         HAVING COUNT(*) >= 2
            AND now() - MAX(created_at) > interval '45 days'`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        customerId: row.customer_id,
        orderCount: Number(row.order_count),
        daysSinceLastOrder: Number(row.days_since_last_order),
      }));
    });
  } catch {
    return [];
  }
}

export async function runChurnScan(tenantId: string): Promise<{ scanned: number; smsSent: number }> {
  try {
    const customers = await scanForChurnRisk(tenantId);
    let smsSent = 0;
    for (const customer of customers) {
      const body = scrubPii(
        'Hi! We noticed it has been a while since your last order. Here is 15% off your next purchase: WELCOME15',
      );
      // Real deployments would retrieve the customer phone from CRM/Shopify; unavailable here.
      const smsResult = await sendSms('+15555550100', body);
      if (smsResult.success) smsSent += 1;
      await withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO ticket_events
             (tenant_id, ticket_id, event_type, detail, llm_cost_usd, latency_ms)
           VALUES ($1, NULL, 'Churn_Sms_Sent', $2::jsonb, 0, NULL)`,
          [tenantId, JSON.stringify({
            customerId: customer.customerId,
            orderCount: customer.orderCount,
            daysSinceLastOrder: customer.daysSinceLastOrder,
            smsResult,
          })],
        );
      });
    }
    return { scanned: customers.length, smsSent };
  } catch {
    return { scanned: 0, smsSent: 0 };
  }
}
