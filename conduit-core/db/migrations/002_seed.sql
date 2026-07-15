INSERT INTO tenants (id, company_name, shopify_domain, webhook_secret)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Aurora Apparel Co.',
    'aurora-apparel.myshopify.com',
    'demo_webhook_secret_change_me'
);

INSERT INTO users (tenant_id, email, role, api_token)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'owner@aurora-apparel.com', 'Owner', 'tok_owner_demo'),
    ('00000000-0000-0000-0000-000000000001', 'admin@aurora-apparel.com', 'Admin', 'tok_admin_demo'),
    ('00000000-0000-0000-0000-000000000001', 'manager@aurora-apparel.com', 'Manager', 'tok_manager_demo'),
    ('00000000-0000-0000-0000-000000000001', 'viewer@aurora-apparel.com', 'Viewer', 'tok_viewer_demo');
