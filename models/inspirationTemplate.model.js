/**
 * @fileoverview Model de templates de inspiracao da Arte Guia
 * @description Sprint Image v2 (maio/2026).
 *
 * Duas tabelas:
 *   - image_inspiration_templates  → globais por tenant (qualquer cliente acessa)
 *   - client_inspiration_templates → especificos por cliente
 *
 * As funcoes deste model abstraem o "scope" (global|client) — o caller
 * escolhe e o resto e identico. ai_description e gerado por Vision em modo
 * lazy: so e populado na PRIMEIRA vez que o template e usado como ref de
 * uma geracao real, pra economizar custo (evita Vision em batch upload).
 */

const { query, queryOne } = require('../infra/db');

const VALID_CATEGORIES = ['feed', 'story', 'ad', 'banner', 'capa', 'quote', 'outros'];
const SCOPES = { GLOBAL: 'global', CLIENT: 'client' };

function tableForScope(scope) {
  return scope === SCOPES.CLIENT ? 'client_inspiration_templates' : 'image_inspiration_templates';
}

// ── Listagem ────────────────────────────────────────────────────────────────

/**
 * Lista templates GLOBAIS ativos do tenant. Filtro opcional por categoria.
 */
async function getActiveGlobalTemplates(tenantId, category = null) {
  if (!tenantId) return [];
  if (category) {
    return query(
      `SELECT * FROM image_inspiration_templates
        WHERE tenant_id = $1 AND is_active = TRUE AND category = $2
        ORDER BY usage_count DESC, created_at DESC`,
      [tenantId, category]
    );
  }
  return query(
    `SELECT * FROM image_inspiration_templates
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY category, usage_count DESC, created_at DESC`,
    [tenantId]
  );
}

/**
 * Lista TODOS os templates globais (inclui inativos) — usado no settings.
 */
async function getAllGlobalTemplates(tenantId) {
  return query(
    `SELECT * FROM image_inspiration_templates
      WHERE tenant_id = $1
      ORDER BY is_active DESC, category, created_at DESC`,
    [tenantId]
  );
}

/**
 * Lista templates de UM CLIENTE.
 */
async function getClientTemplates(clientId, tenantId) {
  if (!clientId || !tenantId) return [];
  return query(
    `SELECT * FROM client_inspiration_templates
      WHERE client_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC`,
    [clientId, tenantId]
  );
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Cria template (scope='global'|'client'). Para global, exige category.
 *
 * @param {object} data
 * @param {'global'|'client'} data.scope
 * @param {string} data.tenantId
 * @param {string} [data.clientId] - obrigatorio se scope=client
 * @param {string} data.title
 * @param {string} data.url
 * @param {string} [data.thumbnailUrl]
 * @param {string} [data.category]
 * @param {string} [data.description]
 */
async function createTemplate(data) {
  const {
    scope, tenantId, clientId,
    category, title, url, thumbnailUrl, description,
  } = data;

  if (!tenantId) throw new Error('tenantId obrigatorio');
  if (!title || !url) throw new Error('title e url obrigatorios');
  if (scope === SCOPES.CLIENT && !clientId) throw new Error('clientId obrigatorio em scope=client');
  if (scope === SCOPES.GLOBAL && !category) throw new Error('category obrigatoria em scope=global');
  if (category && !VALID_CATEGORIES.includes(category)) {
    throw new Error(`category invalida (use ${VALID_CATEGORIES.join('|')})`);
  }

  if (scope === SCOPES.GLOBAL) {
    return queryOne(
      `INSERT INTO image_inspiration_templates
         (tenant_id, category, title, url, thumbnail_url, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, category, title, url, thumbnailUrl || null, description || null]
    );
  }
  return queryOne(
    `INSERT INTO client_inspiration_templates
       (tenant_id, client_id, category, title, url, thumbnail_url, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, clientId, category || null, title, url, thumbnailUrl || null, description || null]
  );
}

/**
 * Atualiza campos editaveis (title/category/description/is_active no global).
 */
async function updateTemplate(id, scope, tenantId, patch) {
  const allowedGlobal = ['title', 'category', 'description', 'is_active', 'thumbnail_url'];
  const allowedClient = ['title', 'category', 'description', 'thumbnail_url'];
  const allowed = scope === SCOPES.GLOBAL ? allowedGlobal : allowedClient;

  const sets = [];
  const params = [id, tenantId];
  let idx = 3;
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      sets.push(`${k} = $${idx}`);
      params.push(patch[k]);
      idx += 1;
    }
  }
  if (sets.length === 0) return getTemplateById(id, scope, tenantId);
  sets.push(`updated_at = now()`);

  return queryOne(
    `UPDATE ${tableForScope(scope)}
       SET ${sets.join(', ')}
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    params
  );
}

async function getTemplateById(id, scope, tenantId) {
  return queryOne(
    `SELECT * FROM ${tableForScope(scope)} WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function deleteTemplate(id, scope, tenantId) {
  return queryOne(
    `DELETE FROM ${tableForScope(scope)} WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

// ── Tracking de uso ─────────────────────────────────────────────────────────

/**
 * Incrementa usage_count quando o template e usado como ref numa geracao.
 * Chamado fire-and-forget pelo handler de /api/image/generate.
 *
 * @param {string} id
 * @param {'global'|'client'} scope
 * @param {string} tenantId
 */
async function incrementUsageCount(id, scope, tenantId) {
  if (!id || !tenantId) return;
  try {
    await query(
      `UPDATE ${tableForScope(scope)}
          SET usage_count = usage_count + 1, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
  } catch (err) {
    console.warn('[WARN][InspirationTemplate] incrementUsageCount falhou', { id, scope, error: err.message });
  }
}

/**
 * Garante que o template tem ai_description populada. Se nao tem,
 * chama Vision (modo lazy) e cacheia. Roda na PRIMEIRA vez que e usado
 * como ref. Reusos seguintes pegam do cache.
 *
 * @returns {Promise<string|null>} ai_description (cacheada ou recem-gerada)
 */
async function ensureAIDescription(id, scope, tenantId) {
  if (!id || !tenantId) return null;
  const tpl = await getTemplateById(id, scope, tenantId);
  if (!tpl) return null;
  if (tpl.ai_description) return tpl.ai_description;

  // Lazy: chama Vision agora
  const { analyzeImage } = require('../infra/api/vision');
  const { loadLocalUpload, INSPIRATION_INSTRUCTION } = require('./agentes/imagecreator/referenceVision');

  const buffer = await loadLocalUpload(tpl.url);
  if (!buffer) return null;

  try {
    const result = await analyzeImage(buffer, INSPIRATION_INSTRUCTION, {
      detail: 'high', maxTokens: 600,
      tenantId,
      operationType: 'image_template_describe',
      sessionId: id,
    });
    const description = (result?.analysis || '').trim();
    if (!description) return null;

    await query(
      `UPDATE ${tableForScope(scope)}
          SET ai_description = $3, ai_described_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, description]
    );
    console.log('[INFO][InspirationTemplate] ai_description gerada (lazy)', { id, scope, tenantId });
    return description;
  } catch (err) {
    console.error('[ERRO][InspirationTemplate] ensureAIDescription falhou', { id, error: err.message });
    return null;
  }
}

module.exports = {
  VALID_CATEGORIES,
  SCOPES,
  getActiveGlobalTemplates,
  getAllGlobalTemplates,
  getClientTemplates,
  createTemplate,
  updateTemplate,
  getTemplateById,
  deleteTemplate,
  incrementUsageCount,
  ensureAIDescription,
};
