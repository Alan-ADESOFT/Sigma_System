/**
 * pages/api/clients/[id]/attachments.js
 * GET    → lista anexos do cliente
 * POST   → faz upload de um arquivo (base64) e cria registro
 * DELETE → remove registro e arquivo do disco
 */

import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { query, queryOne } from '../../../../infra/db';
import { getClientById } from '../../../../models/client.model';
import { resolveTenantId } from '../../../../infra/get-tenant-id';

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } };

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: clientId, attachmentId } = req.query;

  try {
    const client = await getClientById(clientId, tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    /* ── GET ── */
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT * FROM client_attachments WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
      return res.json({ success: true, attachments: rows });
    }

    /* ── POST ── */
    if (req.method === 'POST') {
      const { title, description, fileName, base64, mimeType } = req.body;
      if (!title?.trim() || !fileName || !base64) {
        return res.status(400).json({ success: false, error: 'title, fileName e base64 são obrigatórios' });
      }

      const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const dir = path.join(process.cwd(), 'public', 'uploads', 'attachments', clientId);
      await mkdir(dir, { recursive: true });

      const raw = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(raw, 'base64');
      await writeFile(path.join(dir, safeName), buffer);

      const fileUrl  = `/uploads/attachments/${clientId}/${safeName}`;
      const fileSize = buffer.length;

      const row = await queryOne(
        `INSERT INTO client_attachments (client_id, title, description, file_url, file_name, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [clientId, title.trim(), description?.trim() || null, fileUrl, fileName, fileSize, mimeType || null]
      );
      return res.json({ success: true, attachment: row });
    }

    /* ── DELETE ── */
    if (req.method === 'DELETE') {
      if (!attachmentId) return res.status(400).json({ success: false, error: 'attachmentId é obrigatório' });

      const row = await queryOne(
        `DELETE FROM client_attachments WHERE id = $1 AND client_id = $2 RETURNING *`,
        [attachmentId, clientId]
      );
      if (!row) return res.status(404).json({ success: false, error: 'Anexo não encontrado' });

      const filePath = path.join(process.cwd(), 'public', row.file_url);
      unlink(filePath).catch(() => {});

      return res.json({ success: true, id: attachmentId });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(`[/api/clients/${clientId}/attachments]`, err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
