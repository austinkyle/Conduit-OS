import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { pool } from './db.js';
import { ledgerRoutes } from './routes/ledger.js';
import {
  registerWebhookRawBodyParser,
  webhookRoutes,
} from './routes/webhooks.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });

  registerWebhookRawBodyParser(server);
  server.get('/healthz', async () => ({ ok: true }));
  server.register(webhookRoutes);
  server.register(ledgerRoutes);

  return server;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 4000);

  try {
    await server.listen({ host: '0.0.0.0', port });
    server.log.info(`Conduit Core API listening on 0.0.0.0:${port}`);
    await Promise.all(Array.from({ length: 5 }, () => pool.query('SELECT 1')));
    server.log.info('pg pool warmed');
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}
