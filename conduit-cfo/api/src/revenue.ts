import { withTenant } from './db.js';

export interface DailyRevenue {
  grossRevenue: number;
  orderCount: number;
}

// Read-only against core's `orders` table — same cross-module read boundary conduit-ops uses in
// velocity.ts, never a write.
export async function getDailyRevenue(tenantId: string, date: string): Promise<DailyRevenue> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ gross_revenue: string | number | null; order_count: string | number }>(
        `SELECT COALESCE(SUM(total_price), 0) AS gross_revenue, COUNT(*) AS order_count
           FROM orders
          WHERE tenant_id = $1
            AND created_at::date = $2::date`,
        [tenantId, date],
      );
      const row = result.rows[0];
      return {
        grossRevenue: Number(row?.gross_revenue ?? 0),
        orderCount: Number(row?.order_count ?? 0),
      };
    });
  } catch (error) {
    console.warn('conduit-cfo revenue lookup failed', error);
    return { grossRevenue: 0, orderCount: 0 };
  }
}

export interface CustomerFirstOrder {
  customerId: string;
  firstOrderMonth: string;
}

// One row per customer who has ever ordered, tagged with the calendar month of their first
// order — the basis for cohort grouping. Read-only against core's `orders`.
export async function getCustomerFirstOrderMonths(tenantId: string): Promise<CustomerFirstOrder[]> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ customer_id: string; first_order_month: string }>(
        `SELECT customer_id, date_trunc('month', MIN(created_at))::date::text AS first_order_month
           FROM orders
          WHERE tenant_id = $1 AND customer_id IS NOT NULL
          GROUP BY customer_id`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        customerId: row.customer_id,
        firstOrderMonth: row.first_order_month,
      }));
    });
  } catch (error) {
    console.warn('conduit-cfo customer cohort lookup failed', error);
    return [];
  }
}

// Cumulative revenue from a fixed set of customers through the end of a given calendar month —
// used to compute a cohort's cumulative LTV at M0/M1/M2.
export async function getCohortRevenueThroughMonth(
  tenantId: string,
  customerIds: string[],
  throughMonth: string,
): Promise<number> {
  if (customerIds.length === 0) return 0;
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ revenue: string | number | null }>(
        `SELECT COALESCE(SUM(total_price), 0) AS revenue
           FROM orders
          WHERE tenant_id = $1
            AND customer_id = ANY($2::text[])
            AND created_at < ($3::date + INTERVAL '1 month')`,
        [tenantId, customerIds, throughMonth],
      );
      return Number(result.rows[0]?.revenue ?? 0);
    });
  } catch (error) {
    console.warn('conduit-cfo cohort revenue lookup failed', error);
    return 0;
  }
}
