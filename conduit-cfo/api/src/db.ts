import { Pool, type PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 300000),
  keepAlive: true,
});

// A second pool authenticated as `conduit_cfo_readonly` (see db/migrations/007_cfo_init.sql) —
// this is the real enforcement boundary for the copilot's "read-only replica" requirement. The
// role can never run INSERT/UPDATE/DELETE and is granted SELECT only on cfo's own pre-aggregated
// tables, so every copilot-generated query executes through this pool, never `pool` above.
export const readonlyPool = new Pool({
  connectionString: process.env.CFO_READONLY_DATABASE_URL,
  max: Number(process.env.PG_READONLY_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 300000),
  keepAlive: true,
});

export async function withTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

// Same tenant-scoped transaction pattern as `withTenant`, but against the readonly role/pool.
// RLS still applies to `conduit_cfo_readonly` (it is not a superuser), so `app.tenant_id` must be
// set on this connection too, or every query would return zero rows rather than another tenant's.
export async function withReadonlyTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await readonlyPool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}
