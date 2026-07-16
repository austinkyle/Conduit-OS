-- Demo tenant shared with core/reply/ops seed data. core/ops's own seed data spans only a
-- handful of orders — not enough order history to plot a believable trend chart or three complete
-- LTV cohorts — so, mirroring how conduit-ops seeded synthetic `ad_spend_projections`, this file
-- seeds deterministic historical fixture data directly. `date`/`cohort_month` are computed
-- relative to CURRENT_DATE (not fixed literals) so the dashboard always shows recent-looking
-- history no matter when the demo stack is started. Today's row is deliberately left unseeded —
-- the worker's boot-time immediate rollup job (see worker.ts) computes it live from real
-- core/ops reads, the same pattern conduit-ops used to prove its forecast scan runs on boot.

INSERT INTO financial_snapshots
  (tenant_id, date, gross_revenue, cogs, ad_spend, shipping_costs, processing_fees, net_profit, blended_mer, gross_margin_pct)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  day,
  revenue,
  cogs,
  ad_spend,
  shipping,
  fees,
  ROUND(revenue - cogs - ad_spend - shipping - fees, 2),
  ROUND(revenue / NULLIF(ad_spend, 0), 4),
  ROUND((revenue - cogs) / NULLIF(revenue, 0), 4)
FROM (
  SELECT
    day,
    revenue,
    ROUND(revenue * 0.32, 2) AS cogs,
    ROUND(revenue / 4.2, 2) AS ad_spend,
    ROUND(revenue * 0.06, 2) AS shipping,
    ROUND(revenue * 0.029 + 0.30 * GREATEST(1, ROUND(revenue / 85)), 2) AS fees
  FROM (
    SELECT
      day::date AS day,
      ROUND((9500 + 2800 * sin(EXTRACT(doy FROM day)::numeric / 8.5) + (EXTRACT(day FROM day)::int % 5) * 180)::numeric, 2) AS revenue
    FROM generate_series(CURRENT_DATE - INTERVAL '46 days', CURRENT_DATE - INTERVAL '1 day', INTERVAL '1 day') AS day
  ) rev
) calc;

INSERT INTO ad_spend_daily (tenant_id, date, platform, campaign, spend, conversions)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  fs.date,
  s.platform,
  s.campaign,
  ROUND(fs.ad_spend * s.share, 2),
  GREATEST(0, ROUND(fs.ad_spend * s.share / 38))
FROM financial_snapshots fs
CROSS JOIN (VALUES
  ('Meta'::ad_platform, 'Meta — Prospecting', 0.35),
  ('Meta'::ad_platform, 'Meta — Retargeting', 0.20),
  ('Google'::ad_platform, 'Google — Search Brand', 0.25),
  ('Google'::ad_platform, 'Google — Shopping', 0.20)
) AS s(platform, campaign, share)
WHERE fs.tenant_id = '00000000-0000-0000-0000-000000000001';

-- Three complete cohorts (all old enough that M0/M1/M2 have each fully elapsed), chosen so
-- revenue_m0 <= revenue_m1 <= revenue_m2 holds for every seeded row — the live monthly
-- cohort-recompute job adds the current, still-accruing partial cohort separately.
INSERT INTO ltv_cohorts (tenant_id, cohort_month, cohort_size, revenue_m0, revenue_m1, revenue_m2, cac, payback_bucket)
VALUES
  ('00000000-0000-0000-0000-000000000001', date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), 38, 5850.00, 7600.00, 8900.00, 42.00, '30'),
  ('00000000-0000-0000-0000-000000000001', date_trunc('month', CURRENT_DATE - INTERVAL '4 months'), 45, 6300.00, 8400.00, 9700.00, 48.50, '30'),
  ('00000000-0000-0000-0000-000000000001', date_trunc('month', CURRENT_DATE - INTERVAL '3 months'), 52, 1800.00, 4600.00, 9950.00, 61.00, '60');
