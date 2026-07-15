import type { PoolClient } from 'pg';

export async function publishProcessedEvent(
  client: PoolClient,
  event: { ledgerId: string; tenantId: string; topic: string; orderId?: string },
): Promise<void> {
  await client.query("SELECT pg_notify('conduit_events', $1::text)", [JSON.stringify(event)]);
}

export async function sendSlackAlert(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`Slack webhook returned ${response.status}`);
  } catch (error) {
    console.warn('Slack alert failed', error);
  }
}
