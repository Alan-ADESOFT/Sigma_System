/**
 * pages/api/clients/upload-logo.js
 * POST — recebe {fileName, base64, mimeType}, salva em public/uploads/logos/
 * Retorna { success, url }
 */

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { resolveTenantId } from '../../../infra/get-tenant-id';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await resolveTenantId(req); // garante autenticação

    const { fileName, base64 } = req.body;
    if (!fileName || !base64) {
      return res.status(400).json({ success: false, error: 'fileName e base64 são obrigatórios' });
    }

    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    await mkdir(uploadsDir, { recursive: true });

    const raw = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    await writeFile(path.join(uploadsDir, safeName), buffer);

    return res.json({ success: true, url: `/uploads/logos/${safeName}` });
  } catch (err) {
    console.error('[upload-logo]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
