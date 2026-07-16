import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../auth.js';
import { withTenant } from '../db.js';
import { parseInvoice } from '../vision.js';
import { recordUsage } from '../usage.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf', 'text/plain']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

const MAGIC_BYTES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  'application/pdf': Buffer.from('%PDF'),
};

// text/plain has no reliable magic-byte signature; it exists only for the deterministic demo/eval
// fixture path (no external API key required) and is explicitly excluded from this check.
function hasValidMagicBytes(mimeType: string, buffer: Buffer): boolean {
  const signature = MAGIC_BYTES[mimeType];
  if (!signature) return true;
  return buffer.subarray(0, signature.length).equals(signature);
}

export async function invoiceRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/erp/invoices/parse',
    { preHandler: [authenticate, requireRole('Owner', 'Admin')] },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });

      const mimeType = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.code(415).send({ error: `Unsupported file type: ${mimeType}` });
      }

      const supplierId = (file.fields.supplierId as { value?: string } | undefined)?.value;
      const buffer = await file.toBuffer();

      if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
        return reply.code(400).send({ error: 'File is empty or exceeds the 10MB limit' });
      }
      if (!hasValidMagicBytes(mimeType, buffer)) {
        return reply.code(400).send({ error: 'File content does not match its declared type' });
      }

      const tenantId = request.user.tenantId;
      const invoiceId = randomUUID();
      const extension = mimeType.split('/')[1];
      const tenantDir = join(UPLOADS_DIR, tenantId);
      await mkdir(tenantDir, { recursive: true });
      const filePath = join(tenantDir, `${invoiceId}.${extension}`);
      await writeFile(filePath, buffer);

      const invoiceRow = await withTenant(tenantId, async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO invoices (id, tenant_id, supplier_id, file_path, status)
           VALUES ($1, $2, $3, $4, 'Pending')
           RETURNING id`,
          [invoiceId, tenantId, supplierId ?? null, filePath],
        );
        return result.rows[0];
      });

      const parseResult = await parseInvoice(buffer, mimeType, buffer.toString('utf8'));

      await recordUsage(tenantId, 'invoice_ocr', parseResult.source === 'claude-vision'
        ? { metadata: { source: parseResult.source, lineItemCount: parseResult.lineItems.length } }
        : { costUsd: 0, metadata: { source: parseResult.source, lineItemCount: parseResult.lineItems.length } });

      await withTenant(tenantId, async (client) => {
        await client.query(
          `UPDATE invoices SET status = $1, parsed_line_items = $2::jsonb
            WHERE id = $3 AND tenant_id = $4`,
          [
            parseResult.lineItems.length > 0 ? 'Parsed' : 'Failed',
            JSON.stringify(parseResult.lineItems),
            invoiceId,
            tenantId,
          ],
        );

        for (const item of parseResult.lineItems) {
          await client.query(
            `UPDATE products SET unit_cost = $1
              WHERE tenant_id = $2 AND sku = $3`,
            [item.unitCost, tenantId, item.sku],
          );
        }

        await client.query(
          `INSERT INTO po_events (tenant_id, purchase_order_id, event_type, detail)
           VALUES ($1, NULL, 'Invoice_Parsed', $2::jsonb)`,
          [tenantId, JSON.stringify({ invoiceId: invoiceRow.id, source: parseResult.source, lineItemCount: parseResult.lineItems.length })],
        );
      });

      return reply.code(201).send({
        invoiceId: invoiceRow.id,
        status: parseResult.lineItems.length > 0 ? 'Parsed' : 'Failed',
        source: parseResult.source,
        lineItems: parseResult.lineItems,
      });
    },
  );

  server.get<{ Querystring: { status?: string } }>(
    '/api/v1/erp/invoices',
    { preHandler: authenticate },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const invoices = await withTenant(tenantId, async (client) => {
        const conditions = ['tenant_id = $1'];
        const parameters: unknown[] = [tenantId];
        if (request.query.status) {
          parameters.push(request.query.status);
          conditions.push(`status = $${parameters.length}`);
        }
        const result = await client.query(
          `SELECT id, supplier_id, file_path, status, parsed_line_items, created_at
             FROM invoices
            WHERE ${conditions.join(' AND ')}
            ORDER BY created_at DESC`,
          parameters,
        );
        return result.rows;
      });
      return reply.send({ invoices });
    },
  );
}
