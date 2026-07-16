import { withTenant } from './db.js';

interface MetaInsightsResponse {
  data?: Array<{ spend?: string }>;
}

async function fetchMetaSpend(date: string): Promise<number | null> {
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) return null;

  try {
    const params = new URLSearchParams({
      fields: 'spend',
      time_range: JSON.stringify({ since: date, until: date }),
      access_token: accessToken,
    });
    const response = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/insights?${params.toString()}`);
    if (!response.ok) throw new Error(`Meta Marketing API returned ${response.status}`);
    const body = await response.json() as MetaInsightsResponse;
    const spend = body.data?.[0]?.spend;
    return spend !== undefined ? Number(spend) : 0;
  } catch (error) {
    console.warn('conduit-cfo Meta ad spend sync failed, keeping existing ledger', error);
    return null;
  }
}

// The "Autonomous Ad Spend Monitor": when META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID are set, this
// pulls that day's real Meta spend and upserts it into `ad_spend_daily` as one live-synced
// campaign row. Google Ads reconciliation is intentionally out of scope here — its API requires a
// full OAuth2 refresh-token flow, not a static key, so faking a call against it would be exactly
// the kind of placeholder root CLAUDE.md forbids. Google rows in `ad_spend_daily` come only from
// the deterministic seed/backfill ledger (008_cfo_seed.sql), documented in context.md.
export async function syncAdSpendForDate(tenantId: string, date: string): Promise<void> {
  const metaSpend = await fetchMetaSpend(date);
  if (metaSpend === null) return;

  await withTenant(tenantId, async (client) => {
    await client.query(
      `DELETE FROM ad_spend_daily WHERE tenant_id = $1 AND date = $2::date AND campaign = 'Meta — Live Sync'`,
      [tenantId, date],
    );
    await client.query(
      `INSERT INTO ad_spend_daily (tenant_id, date, platform, campaign, spend, conversions)
       VALUES ($1, $2::date, 'Meta', 'Meta — Live Sync', $3, 0)`,
      [tenantId, date, metaSpend],
    );
  });
}

export async function getDailyAdSpend(tenantId: string, date: string): Promise<number> {
  try {
    return await withTenant(tenantId, async (client) => {
      const result = await client.query<{ spend: string | number | null }>(
        `SELECT COALESCE(SUM(spend), 0) AS spend FROM ad_spend_daily WHERE tenant_id = $1 AND date = $2::date`,
        [tenantId, date],
      );
      return Number(result.rows[0]?.spend ?? 0);
    });
  } catch (error) {
    console.warn('conduit-cfo ad spend lookup failed', error);
    return 0;
  }
}
