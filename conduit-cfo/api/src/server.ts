import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { pool } from './db.js';
import { analyticsRoutes } from './routes/analytics.js';
import { copilotRoutes } from './routes/copilot.js';
import { statsRoutes } from './routes/stats.js';
import { usageRoutes } from './routes/usage.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });
  server.get('/healthz', async () => ({ ok: true }));
  server.register(analyticsRoutes);
  server.register(copilotRoutes);
  server.register(statsRoutes);
  server.register(usageRoutes);
  return server;
}

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  const server = buildServer();
  const port = Number(process.env.PORT ?? 4003);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`conduit-cfo api listening on ${port}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
