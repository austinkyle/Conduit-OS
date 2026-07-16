import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { runCopilotQuery } from '../copilot.js';

export async function copilotRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: { question: string } }>(
    '/api/v1/analytics/copilot/query',
    { preHandler: authenticate },
    async (request, reply) => {
      const question = request.body?.question;
      if (typeof question !== 'string' || question.trim().length === 0) {
        return reply.code(400).send({ error: 'question is required' });
      }

      const result = await runCopilotQuery(request.user.tenantId, request.user.id, question.trim());
      const statusCode = result.status === 'Error' ? 502 : 200;
      return reply.code(statusCode).send(result);
    },
  );
}
