/**
 * @fileoverview GET/POST /api/image/templates
 *   GET ?clientId=... — lista templates
 *   POST { clientId, sourceJobId?, name, description?, ... } — cria
 *
 * Quando sourceJobId é passado, copia format/aspect_ratio/model/prompts dele
 * (poupando do frontend ter que enviar tudo). Marca o job como is_template_saved.
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const {
  listTemplatesByClient, createTemplate,
} = require('../../../../models/imageTemplate.model');
const { getJobById, markAsTemplateSaved } = require('../../../../models/imageJob.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);

  if (req.method === 'GET') {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });
    const items = await listTemplatesByClient(clientId, tenantId);
    return res.json({ success: true, data: items });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const { clientId, sourceJobId, name, description } = body;
    if (!clientId || !name) {
      return res.status(400).json({ success: false, error: 'clientId e name obrigatórios' });
    }

    let toSave = { ...body };
    if (sourceJobId) {
      const job = await getJobById(sourceJobId, tenantId);
      if (!job) return res.status(404).json({ success: false, error: 'sourceJobId não encontrado' });
      toSave = {
        ...body,
        format:           job.format,
        aspectRatio:      job.aspect_ratio,
        model:            job.model,
        rawDescription:   job.raw_description,
        optimizedPrompt:  job.optimized_prompt,
        observations:     job.observations,
        negativePrompt:   job.negative_prompt,
        previewImageUrl:  job.result_thumbnail_url || job.result_image_url || null,
      };
    }

    if (!toSave.format || !toSave.aspectRatio || !toSave.model || !toSave.rawDescription) {
      return res.status(400).json({ success: false, error: 'format, aspectRatio, model e rawDescription são obrigatórios (passe sourceJobId para herdar do job)' });
    }

    try {
      const tpl = await createTemplate({
        tenantId, clientId,
        sourceJobId: sourceJobId || null,
        name, description,
        format:          toSave.format,
        aspectRatio:     toSave.aspectRatio,
        model:           toSave.model,
        rawDescription:  toSave.rawDescription,
        optimizedPrompt: toSave.optimizedPrompt,
        observations:    toSave.observations,
        negativePrompt:  toSave.negativePrompt,
        previewImageUrl: toSave.previewImageUrl,
        createdBy:       user.id,
      });

      if (sourceJobId) {
        await markAsTemplateSaved(sourceJobId, tenantId);
      }

      console.log('[SUCESSO][API:image/templates] template criado', {
        id: tpl.id, clientId, sourceJobId,
      });
      return res.status(201).json({ success: true, data: tpl });
    } catch (err) {
      if (err.code === 'TEMPLATE_LIMIT' || err.statusCode === 400) {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Já existe um template com esse nome neste cliente' });
      }
      console.error('[ERRO][API:image/templates]', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
