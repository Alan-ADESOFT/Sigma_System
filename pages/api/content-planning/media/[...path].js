/**
 * pages/api/content-planning/media/[...path].js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/content-planning/media/{tenantId}/{planId}/{fileName}
 *
 * Serve arquivos do volume Railway. Defesas:
 *   · bloqueia leitura cross-tenant (path tenant !== resolved tenant)
 *   · bloqueia path traversal (.., /, \)
 *   · valida estrutura: exatamente 3 segmentos
 *
 * Sem dependencia externa de mime-types — usamos um mapa inline.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const fs = require('fs');
const path = require('path');
const { getStorageRoot } = require('../../../../infra/contentPlanMedia');

const EXT_TO_MIME = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  gif:  'image/gif',
  mp4:  'video/mp4',
  mov:  'video/quicktime',
  webm: 'video/webm',
};

function lookupMime(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

function isUnsafeSegment(seg) {
  return !seg || seg === '..' || seg.includes('/') || seg.includes('\\') || seg.includes('\0');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const tenantId = await resolveTenantId(req);
  const segments = req.query.path; // [tenantId, planId, fileName]

  if (!Array.isArray(segments) || segments.length !== 3) {
    return res.status(400).json({ success: false, error: 'path invalido' });
  }
  const [pathTenant, planId, fileName] = segments;

  // Cross-tenant: bloqueia
  if (pathTenant !== tenantId) {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }

  // Path traversal: bloqueia em todos os segmentos
  if (isUnsafeSegment(pathTenant) || isUnsafeSegment(planId) || isUnsafeSegment(fileName) || fileName.includes('..')) {
    return res.status(400).json({ success: false, error: 'segmento invalido' });
  }

  const filePath = path.join(getStorageRoot(), 'content-planning', pathTenant, planId, fileName);

  // Defesa final: o caminho resolvido precisa estar dentro do diretorio esperado
  const expectedRoot = path.join(getStorageRoot(), 'content-planning', pathTenant, planId);
  if (!filePath.startsWith(expectedRoot + path.sep) && filePath !== expectedRoot) {
    return res.status(400).json({ success: false, error: 'path invalido' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Arquivo nao encontrado' });
  }

  res.setHeader('Content-Type', lookupMime(fileName));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}
