import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { pool } from './db.js';
import {
  embedMissingKnowledgeBaseRows,
  knowledgeBaseRoutes,
} from './routes/knowledge-base.js';
import { ticketRoutes } from './routes/tickets.js';
import { draftRoutes } from './routes/drafts.js';
import { actionRoutes } from './routes/actions.js';
import { churnRoutes } from './routes/churn.js';
import { statsRoutes } from './routes/stats.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });
  server.get('/healthz', async () => ({ ok: true }));
  server.register(ticketRoutes);
  server.register(knowledgeBaseRoutes);
  server.register(draftRoutes);
  server.register(actionRoutes);
  server.register(churnRoutes);
  server.register(statsRoutes);
  return server;
}

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  const server = buildServer();
  const port = Number(process.env.PORT ?? 4001);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`conduit-reply api listening on ${port}`);
  const count = await embedMissingKnowledgeBaseRows();
  console.log(`embedded ${count} knowledge base rows`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
