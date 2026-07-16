import { withTenant } from './db.js';
import { sendEmail } from './email.js';
import { recordUsage } from './usage.js';

interface PurchaseOrderItem {
  productId: string;
  sku: string;
  title: string;
  quantity: number;
  unitCost: number;
}

// Drafts and sends the supplier-facing PO email, then logs the send in po_events. Called on the
// Draft -> Sent status transition (routes/purchase-orders.ts) or directly by the worker.
export async function sendPurchaseOrderToSupplier(
  tenantId: string,
  purchaseOrderId: string,
): Promise<{ sent: boolean; simulated: boolean }> {
  const context = await withTenant(tenantId, async (client) => {
    const poResult = await client.query<{
      id: string;
      supplier_id: string;
      items: PurchaseOrderItem[];
      total_amount: string | number;
    }>(
      `SELECT id, supplier_id, items, total_amount
         FROM purchase_orders
        WHERE id = $1 AND tenant_id = $2`,
      [purchaseOrderId, tenantId],
    );
    const purchaseOrder = poResult.rows[0];
    if (!purchaseOrder) return null;

    const supplierResult = await client.query<{ name: string; email: string }>(
      `SELECT name, email FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [purchaseOrder.supplier_id, tenantId],
    );
    const supplier = supplierResult.rows[0];
    if (!supplier) return null;

    return { purchaseOrder, supplier };
  });

  if (!context) return { sent: false, simulated: false };

  const { purchaseOrder, supplier } = context;
  const items = Array.isArray(purchaseOrder.items) ? purchaseOrder.items : [];
  const lines = items.map(
    (item) => `${item.sku}  ${item.title}  ${item.quantity} x $${item.unitCost.toFixed(2)}`,
  );
  const subject = `Purchase Order ${purchaseOrder.id}`;
  const body = [
    `New purchase order from Conduit-OS.`,
    '',
    ...lines,
    '',
    `Total: $${Number(purchaseOrder.total_amount).toFixed(2)}`,
  ].join('\n');

  const emailResult = await sendEmail(supplier.email, subject, body);

  await recordUsage(tenantId, 'supplier_email', emailResult.simulated
    ? { costUsd: 0, metadata: { simulated: true } }
    : { metadata: { simulated: false } });

  await withTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE purchase_orders SET status = 'Sent', updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [purchaseOrderId, tenantId],
    );
    await client.query(
      `INSERT INTO po_events (tenant_id, purchase_order_id, event_type, detail)
       VALUES ($1, $2, 'Sent', $3::jsonb)`,
      [tenantId, purchaseOrderId, JSON.stringify({ supplierEmail: supplier.email, emailResult })],
    );
  });

  return { sent: emailResult.success, simulated: emailResult.simulated };
}
