import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { pool, withTenant } from './db.js';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

interface UserRow {
  id: string;
  tenant_id: string;
  role: string;
  email: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authorization = request.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const token = match[1];
  const tenantLookup = await pool.query<{ tenant_id: string }>(
    `SELECT u.tenant_id
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.api_token = $1`,
    [token],
  );
  const tenantId = tenantLookup.rows[0]?.tenant_id;
  if (!tenantId) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const user = await withTenant(tenantId, async (client) => {
    const result = await client.query<UserRow>(
      `SELECT u.id, u.tenant_id, u.role, u.email
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
        WHERE u.api_token = $1
          AND u.tenant_id = $2
          AND t.id = $2`,
      [token, tenantId],
    );
    return result.rows[0];
  });

  if (!user) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  request.user = {
    id: user.id,
    tenantId: user.tenant_id,
    role: user.role,
    email: user.email,
  };
}

export function requireRole(...roles: string[]): preHandlerHookHandler {
  return async (request, reply): Promise<void> => {
    if (!request.user || !roles.includes(request.user.role)) {
      await reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
