import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { classifyTicketBody } from '../classifier.js';
import { withTenant } from '../db.js';
import { extractOrderIds } from '../extractor.js';
import { generateDraftReply } from '../llm.js';
import { buildDraftTemplate, lookupOrderContext, retrieveKnowledgeBase } from '../rag.js';

interface MessageRow {
  sender_type: 'Customer' | 'Human_Agent' | 'AI_Agent';
  body: string;
}

export async function draftRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Params: { id: string } }>(
    '/api/v1/crm/tickets/:id/generate-draft',
    { preHandler: authenticate },
    async (request, reply) => {
      const startedAt = Date.now();
      const tenantId = request.user.tenantId;
      const ticketData = await withTenant(tenantId, async (client) => {
        const ticketResult = await client.query<{ id: string }>(
          `SELECT id FROM tickets WHERE id = $1 AND tenant_id = $2`,
          [request.params.id, tenantId],
        );
        if (!ticketResult.rows[0]) return null;
        const messagesResult = await client.query<MessageRow>(
          `SELECT sender_type, body
             FROM messages
            WHERE ticket_id = $1 AND tenant_id = $2
            ORDER BY created_at ASC`,
          [request.params.id, tenantId],
        );
        return { messages: messagesResult.rows };
      });

      if (!ticketData) return reply.code(404).send({ error: 'Ticket not found' });

      const queryText = ticketData.messages
        .filter((message) => message.sender_type === 'Customer')
        .map((message) => message.body)
        .join('\n');
      const orderIds = extractOrderIds(queryText);
      const contexts = await Promise.all(orderIds.map((id) => lookupOrderContext(tenantId, id)));
      const orderContexts = contexts.filter((context) => context !== null);
      const snippets = await retrieveKnowledgeBase(tenantId, queryText);
      const classification = await classifyTicketBody(queryText);
      const templateDraft = buildDraftTemplate(orderContexts, snippets, classification);

      let draft = templateDraft;
      let source: 'llm' | 'template' = 'template';
      if (process.env.ANTHROPIC_API_KEY) {
        const generated = await generateDraftReply(
          `Write a concise customer-support reply using this template and preserve its factual details.\nCategory: ${classification.category}\nSentiment: ${classification.sentiment}\n\nTemplate:\n${templateDraft}`,
        );
        if (generated) {
          draft = generated;
          source = 'llm';
        }
      }

      const latencyMs = Date.now() - startedAt;
      await withTenant(tenantId, async (client) => {
        await client.query(
          `INSERT INTO ticket_events
             (tenant_id, ticket_id, event_type, detail, llm_cost_usd, latency_ms)
           VALUES ($1, $2, 'Draft_Generated', $3::jsonb, 0, $4)`,
          [tenantId, request.params.id, JSON.stringify({ source, category: classification.category, orderIds }), latencyMs],
        );
      });

      return reply.send({ draft, source, classification });
    },
  );
}
