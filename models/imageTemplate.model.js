/**
 * @fileoverview Model de templates de imagem
 * @description CRUD da tabela image_templates.
 * Limite por cliente (max_template_per_client) é validado AQUI no createTemplate
 * (não no SQL — fica configurável por tenant via image_settings).
 */

const { query, queryOne } = require('../infra/db');
const { getOrCreate: getSettings } = require('./imageSettings.model');
// OTIMIZAÇÃO: cache 2min — templates list é mostrada na sidebar do workspace
// e raramente muda durante uma sessão.
const cache = require('../infra/cache');

/**
 * Lista templates de um cliente, ordenados por mais recentes.
 */
async function listTemplatesByClient(clientId, tenantId) {
  return cache.getOrSet(
    cache.ImageKeys.templatesList(clientId, tenantId),
    () => query(
      `SELECT t.*,
              u.name AS created_by_name
         FROM image_templates t
         LEFT JOIN tenants u ON u.id = t.created_by
        WHERE t.client_id = $1 AND t.tenant_id = $2
        ORDER BY t.created_at DESC`,
      [clientId, tenantId]
    ),
    120 // 2 min
  );
}

function invalidateTemplatesCache(clientId, tenantId) {
  cache.invalidate(cache.ImageKeys.templatesList(clientId, tenantId));
}

async function getTemplateById(id, tenantId) {
  return queryOne(
    `SELECT * FROM image_templates WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Cria template a partir de um job existente (ou dados manuais).
 * Valida o limite max_template_per_client antes de inserir.
 *
 * @param {object} data
 */
async function createTemplate(data) {
  const {
    tenantId, clientId, sourceJobId,
    name, description,
    format, aspectRatio, model,
    rawDescription, optimizedPrompt, observations, negativePrompt,
    previewImageUrl,
    createdBy,
  } = data;

  if (!tenantId || !clientId || !name || !format || !aspectRatio || !model || !rawDescription) {
    throw new Error('createTemplate: campos obrigatórios faltando');
  }

  // Validação de limite (configurável por tenant)
  const settings = await getSettings(tenantId);
  const max = settings.max_template_per_client || 20;
  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS n FROM image_templates WHERE client_id = $1 AND tenant_id = $2`,
    [clientId, tenantId]
  );
  if ((countRow?.n || 0) >= max) {
    // Audit: tentativa de exceder limite — útil pra ver quem está pressionando o teto
    try {
      const { logAudit } = require('./imageAudit.model');
      await logAudit({
        tenantId, userId: createdBy,
        action: 'template_limit_reached',
        details: { clientId, currentCount: countRow.n, max },
      });
    } catch {}
    const err = new Error(`Limite de ${max} templates por cliente atingido`);
    err.statusCode = 400;
    err.code = 'TEMPLATE_LIMIT';
    throw err;
  }

  const row = await queryOne(
    `INSERT INTO image_templates
       (tenant_id, client_id, source_job_id, name, description,
        format, aspect_ratio, model,
        raw_description, optimized_prompt, observations, negative_prompt,
        preview_image_url, created_by)
     VALUES ($1, $2, $3, $4, $5,
             $6, $7, $8,
             $9, $10, $11, $12,
             $13, $14)
     RETURNING *`,
    [
      tenantId, clientId, sourceJobId || null,
      String(name).trim(), description || null,
      format, aspectRatio, model,
      rawDescription, optimizedPrompt || null,
      observations || null, negativePrompt || null,
      previewImageUrl || null, createdBy || null,
    ]
  );
  invalidateTemplatesCache(clientId, tenantId);
  return row;
}

/**
 * Atualiza nome/descrição (resto é imutável: clones de jobs originais).
 */
async function updateTemplate(id, tenantId, fields) {
  const sets = [];
  const params = [id, tenantId];
  if (typeof fields.name === 'string') {
    params.push(fields.name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (fields.description !== undefined) {
    params.push(fields.description || null);
    sets.push(`description = $${params.length}`);
  }
  if (sets.length === 0) return getTemplateById(id, tenantId);
  sets.push(`updated_at = now()`);

  const updated = await queryOne(
    `UPDATE image_templates SET ${sets.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    params
  );
  if (updated?.client_id) invalidateTemplatesCache(updated.client_id, tenantId);
  return updated;
}

/**
 * Remove um template (não toca em jobs filhos — eles ficam com template_id NULL).
 */
async function deleteTemplate(id, tenantId) {
  const row = await queryOne(
    `DELETE FROM image_templates WHERE id = $1 AND tenant_id = $2 RETURNING id, client_id`,
    [id, tenantId]
  );
  if (row?.client_id) invalidateTemplatesCache(row.client_id, tenantId);
  return !!row;
}

/**
 * Incrementa usage_count + atualiza last_used_at.
 * Usado quando o usuário escolhe um template para gerar nova imagem.
 */
async function incrementUsage(id, tenantId) {
  return queryOne(
    `UPDATE image_templates
        SET usage_count = usage_count + 1,
            last_used_at = now(),
            updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, usage_count, last_used_at`,
    [id, tenantId]
  );
}

module.exports = {
  listTemplatesByClient,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementUsage,
  invalidateTemplatesCache,
};
