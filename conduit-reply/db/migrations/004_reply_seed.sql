-- NOTE: this is one-time init SQL, not application code. This is the ONE
-- sanctioned exception to "conduit-reply never writes to conduit-core's
-- tables" — it seeds a fixture order so conduit-reply's eval scenarios have
-- deterministic order data to retrieve. No conduit-reply *application* code
-- may ever INSERT/UPDATE/DELETE into conduit-core's tables.
INSERT INTO orders (tenant_id, external_order_id, customer_id, total_price, currency, payment_status, shipping_status, fraud_score, fraud_flagged, raw_data)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '1054',
  'cust_demo_1054',
  128.00,
  'USD',
  'paid',
  'in_transit',
  0,
  false,
  '{"tracking_number":"1Z999AA10123456784","carrier":"UPS","estimated_delivery":"2026-07-18"}'::jsonb
)
ON CONFLICT (tenant_id, external_order_id) DO NOTHING;

INSERT INTO tickets (id, tenant_id, customer_id, channel, status)
VALUES (
  '10000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'cust_demo_1054',
  'Email',
  'Open'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (ticket_id, tenant_id, sender_type, body)
VALUES (
  '10000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'Customer',
  'Hi, where is order #1054? It has been over a week.'
)
ON CONFLICT DO NOTHING;

INSERT INTO knowledge_base (tenant_id, title, content)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Shipping & Tracking Policy', 'Orders ship within 1-2 business days. You will receive a tracking number by email once your order ships. Standard delivery takes 5-7 business days.'),
  ('00000000-0000-0000-0000-000000000001', 'Return & Refund Policy', 'Items may be returned within 30 days of delivery for a full refund. Items must be unworn and in original packaging. Refunds are issued to the original payment method within 5-7 business days of receiving the return.'),
  ('00000000-0000-0000-0000-000000000001', 'Address Change Policy', 'Shipping address changes are only possible before an order ships. Once an order has a tracking number, the address cannot be changed and the order must be redirected with the carrier directly.'),
  ('00000000-0000-0000-0000-000000000001', 'Order Cancellation Policy', 'Orders can be cancelled for a full refund within 12 hours of placement, as long as the order has not yet shipped. After that window, cancellation is not guaranteed.')
ON CONFLICT (tenant_id, title) DO NOTHING;
