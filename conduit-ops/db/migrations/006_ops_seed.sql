-- Demo tenant shared with core/reply seed data.
DO $$
DECLARE
  demo_tenant UUID := '00000000-0000-0000-0000-000000000001';
  supplier_northwind UUID := gen_random_uuid();
  supplier_pacific UUID := gen_random_uuid();
BEGIN
  INSERT INTO suppliers (id, tenant_id, name, email, lead_time_days, moq) VALUES
    (supplier_northwind, demo_tenant, 'Northwind Packaging Co.', 'orders@northwindpack.example', 14, 500),
    (supplier_pacific, demo_tenant, 'Pacific Rim Textiles', 'sales@pacificrimtextiles.example', 21, 250);

  INSERT INTO products (tenant_id, supplier_id, title, sku, inventory_qty, safety_stock_limit, unit_cost) VALUES
    (demo_tenant, supplier_northwind, 'Insulated Steel Tumbler 24oz', 'TUM-24-STL', 42, 150, 6.50),
    (demo_tenant, supplier_northwind, 'Insulated Steel Tumbler 32oz', 'TUM-32-STL', 310, 120, 7.75),
    (demo_tenant, supplier_northwind, 'Bamboo Travel Mug', 'MUG-BAM-16', 180, 80, 5.20),
    (demo_tenant, supplier_pacific, 'Organic Cotton Tote Bag', 'TOTE-COT-01', 640, 200, 3.10),
    (demo_tenant, supplier_pacific, 'Merino Wool Beanie', 'BEAN-WOOL-01', 275, 100, 8.90),
    (demo_tenant, supplier_pacific, 'Recycled Fleece Blanket', 'BLKT-FLC-01', 95, 60, 12.40);

  INSERT INTO ad_spend_projections (tenant_id, product_id, week_start, projected_spend_usd)
  SELECT demo_tenant, p.id, d.week_start, d.spend
  FROM products p
  CROSS JOIN (VALUES
    (DATE '2026-07-13', 4200.00),
    (DATE '2026-07-20', 5100.00),
    (DATE '2026-07-27', 4800.00)
  ) AS d(week_start, spend)
  WHERE p.tenant_id = demo_tenant AND p.sku IN ('TUM-24-STL', 'TOTE-COT-01');
END $$;
