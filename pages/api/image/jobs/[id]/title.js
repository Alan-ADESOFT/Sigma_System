/**
 * @fileoverview PUT /api/image/jobs/[id]/title — atualiza título do job
 * @description Editado inline no card/modal. Marca title_user_edited=true
 * pra que o gerador automático não sobrescreva depois.
 *
 * Sprint v1.1 — abril 2026.
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const { updateJobTitle, getJobById } = require('../../../../../models/imageJob.model');

export default async function handler(req, res) {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use PUT ou POST' });
  }

  try {
    await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;
  const { title } = req.body || {};

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'title obrigatório (string não-vazia)' });
  }

  const job = await getJobById(id, tenantId);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado' });

  const updated = await updateJobTitle(id, tenantId, title.trim().slice(0, 80), true);
  return res.json({ success: true, data: updated });
}
