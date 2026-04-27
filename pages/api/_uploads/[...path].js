/**
 * GET /api/_uploads/<...path>
 *
 * Serve arquivos do volume montado em /app/public/uploads. Usado via rewrite
 * em next.config.js: /uploads/* → /api/_uploads/*. Necessário porque o
 * `next start` em produção não relê arquivos adicionados em public/ depois
 * do build.
 */
const fs = require('fs');
const path = require('path');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end();
  }

  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  // Bloqueia path traversal: nenhum segmento pode ser '..' ou conter null
  for (const seg of parts) {
    if (!seg || seg === '..' || seg.includes('\0') || seg.includes('/') || seg.includes('\\')) {
      return res.status(400).end();
    }
  }

  const root = path.join(process.cwd(), 'public', 'uploads');
  const filePath = path.join(root, ...parts);
  // Garante que o resolvido fica dentro de root
  if (!filePath.startsWith(root + path.sep)) {
    return res.status(400).end();
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(404).end();
  } catch {
    return res.status(404).end();
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (req.method === 'HEAD') return res.status(200).end();
  fs.createReadStream(filePath).pipe(res);
}

export const config = {
  api: { responseLimit: false },
};
