import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { pool, withTenant } from '../db.js';
import { embedText, toVectorLiteral } from '../embeddings.js';

interface KnowledgeBaseDocument {
  title: string;
  content: string;
}

export async function knowledgeBaseRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: { docs: KnowledgeBaseDocument[] } }>(
    '/api/v1/crm/knowledge-base/sync',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const docs = request.body?.docs;
      if (
        !Array.isArray(docs) ||
        docs.some(
          (doc) =>
            !doc ||
            typeof doc.title !== 'string' ||
            doc.title.trim().length === 0 ||
            typeof doc.content !== 'string' ||
            doc.content.trim().length === 0,
        )
      ) {
        return reply.code(400).send({ error: 'Docs must contain non-empty title and content strings' });
      }

      const embeddedDocs = await Promise.all(
        docs.map(async (doc) => ({ ...doc, embedding: await embedText(doc.content) })),
      );
      const tenantId = request.user.tenantId;
      await withTenant(tenantId, async (client) => {
        for (const doc of embeddedDocs) {
          await client.query(
            `INSERT INTO knowledge_base (tenant_id, title, content, embedding)
             VALUES ($1, $2, $3, $4::vector)
             ON CONFLICT (tenant_id, title) DO UPDATE
             SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
            [tenantId, doc.title, doc.content, toVectorLiteral(doc.embedding)],
          );
        }
      });

      return reply.send({ synced: embeddedDocs.length });
    },
  );
}

export async function embedMissingKnowledgeBaseRows(): Promise<number> {
  try {
    const result = await pool.query<{ id: string; content: string }>(
      'SELECT id, content FROM knowledge_base WHERE embedding IS NULL',
    );
    let updated = 0;
    for (const row of result.rows) {
      const embedding = await embedText(row.content);
      await pool.query(
        'UPDATE knowledge_base SET embedding = $1::vector WHERE id = $2',
        [toVectorLiteral(embedding), row.id],
      );
      updated += 1;
    }
    return updated;
  } catch (error) {
    console.error('Failed to embed missing knowledge base rows', error);
    return 0;
  }
}
