/**
 * @fileoverview GET /api/image/status/:id
 * @description Retorna o status atual de um job. Usado pelo frontend
 * para fazer polling enquanto a imagem é gerada.
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const { getJobById } = require('../../../../models/imageJob.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  const job = await getJobById(id, tenantId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job não encontrado' });
  }

  return res.json({
    success: true,
    data: {
      id: job.id,
      status: job.status,
      format: job.format,
      aspect_ratio: job.aspect_ratio,
      width: job.width,
      height: job.height,
      model: job.model,
      provider: job.provider,
      result_image_url: job.result_image_url,
      result_thumbnail_url: job.result_thumbnail_url,
      result_metadata: job.result_metadata,
      optimized_prompt: job.optimized_prompt,
      error_message: job.error_message,
      error_code: job.error_code,
      duration_ms: job.duration_ms,
      cost_usd: job.cost_usd,
      is_starred: job.is_starred,
      is_template_saved: job.is_template_saved,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      user_name: job.user_name,
      client_name: job.client_name,
      folder_name: job.folder_name,
    },
  });
}
