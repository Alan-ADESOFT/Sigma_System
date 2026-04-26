/**
 * @fileoverview GET/DELETE /api/image/jobs/:id
 * @description GET = detalhes completos | DELETE = soft delete + remove arquivos físicos
 */

const fs = require('fs').promises;
const path = require('path');
const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const { getJobById, softDeleteJob } = require('../../../../models/imageJob.model');

async function safeUnlink(internalUrl) {
  if (!internalUrl || !internalUrl.startsWith('/uploads/')) return;
  const fullPath = path.join(process.cwd(), 'public', internalUrl);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    console.warn('[WARN][API:image/jobs/[id]] não foi possível remover arquivo', {
      path: fullPath, error: err.message,
    });
  }
}

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  if (req.method === 'GET') {
    const job = await getJobById(id, tenantId);
    if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado' });
    return res.json({ success: true, data: job });
  }

  if (req.method === 'DELETE') {
    const deleted = await softDeleteJob(id, tenantId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Job não encontrado' });

    // Remove arquivos físicos (best-effort)
    await Promise.all([
      safeUnlink(deleted.result_image_url),
      safeUnlink(deleted.result_thumbnail_url),
    ]);

    console.log('[INFO][API:image/jobs/[id]] job removido', { id, userId: user.id });
    return res.json({ success: true, data: { id, deleted: true } });
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
