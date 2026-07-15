import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { runChurnScan } from '../churn.js';

export async function churnRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/crm/churn/scan',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const result = await runChurnScan(request.user.tenantId);
      return reply.send(result);
    },
  );
}
