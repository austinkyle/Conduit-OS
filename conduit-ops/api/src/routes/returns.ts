import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { runReturnsScan } from '../returns.js';

export async function returnsRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/erp/returns/scan',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const result = await runReturnsScan(request.user.tenantId);
      return reply.send(result);
    },
  );
}
