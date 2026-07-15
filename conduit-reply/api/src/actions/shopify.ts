// This uses a long-lived static SHOPIFY_ADMIN_ACCESS_TOKEN, suitable for a single-tenant demo/internal tool.
// Production multi-tenant SaaS needs per-tenant OAuth2 token exchange and refresh, out of scope here.

export interface ShopifyActionResult {
  simulated: boolean;
  success: boolean;
  detail: string;
}

async function callShopify(path: string, method: 'POST' | 'PUT', body?: unknown): Promise<ShopifyActionResult> {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN as string;
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN as string;
  try {
    const response = await fetch(`https://${storeDomain}/admin/api/2024-01${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return { simulated: false, success: true, detail: 'Shopify API call succeeded' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { simulated: false, success: false, detail: `Shopify API call failed: ${message}` };
  }
}

export async function updateShippingAddress(externalOrderId: string, newAddress: Record<string, string>): Promise<ShopifyActionResult> {
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOPIFY_STORE_DOMAIN) {
    return { simulated: true, success: true, detail: `Simulated shipping address update for order ${externalOrderId} (no Shopify credentials configured)` };
  }
  // The schema does not track Shopify numeric IDs separately, so externalOrderId is used directly.
  return callShopify(`/orders/${encodeURIComponent(externalOrderId)}.json`, 'PUT', {
    order: { id: externalOrderId, shipping_address: newAddress },
  });
}

export async function cancelOrder(externalOrderId: string): Promise<ShopifyActionResult> {
  if (!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || !process.env.SHOPIFY_STORE_DOMAIN) {
    return { simulated: true, success: true, detail: `Simulated order cancellation for order ${externalOrderId} (no Shopify credentials configured)` };
  }
  // The schema does not track Shopify numeric IDs separately, so externalOrderId is used directly.
  return callShopify(`/orders/${encodeURIComponent(externalOrderId)}/cancel.json`, 'POST');
}
