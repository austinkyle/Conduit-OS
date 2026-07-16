import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { pool } from './db.js';
import { inventoryRoutes } from './routes/inventory.js';
import { purchaseOrderRoutes } from './routes/purchase-orders.js';
import { returnsRoutes } from './routes/returns.js';
import { invoiceRoutes } from './routes/invoices.js';
import { statsRoutes } from './routes/stats.js';

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: true });
  server.register(multipart);
  server.get('/healthz', async () => ({ ok: true }));
  server.register(inventoryRoutes);
  server.register(purchaseOrderRoutes);
  server.register(returnsRoutes);
  server.register(invoiceRoutes);
  server.register(statsRoutes);
  return server;
}

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  const server = buildServer();
  const port = Number(process.env.PORT ?? 4002);
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`conduit-ops api listening on ${port}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
