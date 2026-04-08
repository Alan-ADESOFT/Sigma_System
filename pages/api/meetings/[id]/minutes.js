import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { queryOne } = require('../../../../infra/db');

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '20mb',
  },
};

/* Minimal multipart parser — same pattern as pages/api/upload.js */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
      if (!boundaryMatch) return reject(new Error('Missing boundary'));
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const boundaryBuf = Buffer.from('--' + boundary);

      let start = buf.indexOf(boundaryBuf) + boundaryBuf.length + 2;
      const end = buf.indexOf(Buffer.from('--' + boundary + '--'));
      if (start < 0 || end < 0) return reject(new Error('Invalid multipart'));

      const part = buf.slice(start, end);
      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd < 0) return reject(new Error('Invalid part'));

      const headerStr = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4, part.length - 2);

      const filenameMatch = headerStr.match(/filename="([^"]+)"/);
      const mimeMatch = headerStr.match(/Content-Type:\s*(.+)/i);

      resolve({
        filename: filenameMatch ? filenameMatch[1] : 'file',
        mime: mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream',
        data: body,
      });
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  try {
    const file = await parseMultipart(req);
    if (!file || !file.data.length) {
      return res.status(400).json({ success: false, error: 'Arquivo obrigatório' });
    }

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'minutes');
    await mkdir(uploadDir, { recursive: true });

    const ext = file.filename.includes('.') ? '.' + file.filename.split('.').pop() : '.pdf';
    const finalName = `${id}_${Date.now()}${ext}`;
    const finalPath = join(uploadDir, finalName);
    await writeFile(finalPath, file.data);

    const minutesUrl = `/uploads/minutes/${finalName}`;

    const meeting = await queryOne(
      `UPDATE meetings SET minutes_url = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [minutesUrl, id, tenantId]
    );

    if (!meeting) return res.status(404).json({ success: false, error: 'Reunião não encontrada' });

    return res.json({ success: true, meeting });
  } catch (err) {
    console.error('[ERRO][API:/api/meetings/[id]/minutes]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
