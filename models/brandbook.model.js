/**
 * @fileoverview Model de brandbook por cliente
 * @description CRUD da tabela client_brandbooks.
 * Garante que apenas 1 brandbook fica `is_active = true` por cliente:
 * createBrandbook desativa o ativo antes de inserir o novo (transação).
 */

const fs = require('fs').promises;
const path = require('path');
const { query, queryOne } = require('../infra/db');
// OTIMIZAÇÃO: cache do brandbook ativo. Worker chama isso a CADA geração;
// brandbook muda raramente — TTL 5min reduz queries ao Neon em ~95%.
const cache = require('../infra/cache');

/**
 * Retorna o brandbook ativo do cliente (ou null).
 * Usa o partial unique index idx_brandbooks_client_active.
 *
 * @param {string} clientId
 * @param {string} tenantId
 */
async function getActiveBrandbook(clientId, tenantId) {
  // OTIMIZAÇÃO: cache 5min — endpoint /generate e worker batem nisso a CADA
  // chamada. Invalidado em createBrandbook/updateBrandbook/deleteBrandbook.
  return cache.getOrSet(
    cache.ImageKeys.brandbookActive(clientId, tenantId),
    () => queryOne(
      `SELECT * FROM client_brandbooks
        WHERE client_id = $1 AND tenant_id = $2 AND is_active = true
        LIMIT 1`,
      [clientId, tenantId]
    ),
    300 // 5 min
  );
}

function invalidateBrandbookCache(clientId, tenantId) {
  cache.invalidate(cache.ImageKeys.brandbookActive(clientId, tenantId));
}

/**
 * Lista o histórico de brandbooks (ativos e antigos).
 */
async function listBrandbookHistory(clientId, tenantId, limit = 10) {
  return query(
    `SELECT id, source, file_name, file_size, is_active,
            created_by, created_at, updated_at
       FROM client_brandbooks
      WHERE client_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [clientId, tenantId, limit]
  );
}

/**
 * Busca por ID (filtra tenant).
 */
async function getBrandbookById(id, tenantId) {
  return queryOne(
    `SELECT * FROM client_brandbooks WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Cria um novo brandbook.
 * Transação atômica: desativa o ativo atual + insere o novo como is_active.
 *
 * @param {object} data
 * @param {string} data.tenantId
 * @param {string} data.clientId
 * @param {'ai_generated'|'pdf_upload'|'html_upload'|'manual'} data.source
 * @param {string} [data.fileUrl]
 * @param {string} [data.fileName]
 * @param {number} [data.fileSize]
 * @param {string} [data.mimeType]
 * @param {string} [data.extractedText]
 * @param {object} data.structuredData - JSON do brandbook
 * @param {string} [data.createdBy]
 */
async function createBrandbook(data) {
  const {
    tenantId, clientId, source,
    fileUrl, fileName, fileSize, mimeType,
    extractedText, structuredData,
    createdBy,
  } = data;

  if (!tenantId || !clientId || !source) {
    throw new Error('createBrandbook: tenantId, clientId e source obrigatórios');
  }
  if (!['ai_generated', 'pdf_upload', 'html_upload', 'manual'].includes(source)) {
    throw new Error(`createBrandbook: source inválido (${source})`);
  }

  // Atomicidade via CTE: o driver Neon serverless faz cada query() em uma
  // HTTP request separada (não compartilha conexão), então BEGIN/COMMIT em
  // chamadas distintas não funciona. Empacotamos UPDATE + INSERT em uma
  // única statement com WITH — Postgres avalia ambos no mesmo snapshot.
  try {
    const row = await queryOne(
      `WITH deactivated AS (
         UPDATE client_brandbooks
            SET is_active = false, updated_at = now()
          WHERE client_id = $1 AND tenant_id = $2 AND is_active = true
          RETURNING id
       )
       INSERT INTO client_brandbooks
         (tenant_id, client_id, source, file_url, file_name, file_size,
          mime_type, extracted_text, structured_data, is_active, created_by)
       SELECT $2, $1, $3, $4, $5, $6, $7, $8, $9::jsonb, true, $10
       RETURNING *`,
      [
        clientId, tenantId, source,
        fileUrl || null, fileName || null, fileSize || null,
        mimeType || null, extractedText || null,
        JSON.stringify(structuredData || {}),
        createdBy || null,
      ]
    );
    invalidateBrandbookCache(clientId, tenantId);
    console.log('[SUCESSO][Brandbook] criado', { id: row.id, clientId, source });
    return row;
  } catch (err) {
    console.error('[ERRO][Brandbook] criação falhou', { error: err.message });
    throw err;
  }
}

/**
 * Atualiza campos seletivos de um brandbook.
 * @param {string} id
 * @param {string} tenantId
 * @param {object} fields - structuredData, extractedText, isActive, fileUrl, ...
 */
async function updateBrandbook(id, tenantId, fields) {
  const sets = [];
  const params = [id, tenantId];

  const map = {
    structuredData: 'structured_data',
    extractedText:  'extracted_text',
    isActive:       'is_active',
    fileUrl:        'file_url',
    fileName:       'file_name',
    fileSize:       'file_size',
    mimeType:       'mime_type',
    source:         'source',
  };

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (fields[jsKey] === undefined) continue;
    let val = fields[jsKey];
    if (jsKey === 'structuredData') val = JSON.stringify(val || {});
    params.push(val);
    sets.push(`${dbCol} = $${params.length}`);
  }
  if (sets.length === 0) return getBrandbookById(id, tenantId);
  sets.push(`updated_at = now()`);

  const updated = await queryOne(
    `UPDATE client_brandbooks SET ${sets.join(', ')}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    params
  );
  // Invalida cache se o registro afetado é o ativo (ou virou ativo)
  if (updated?.client_id) invalidateBrandbookCache(updated.client_id, tenantId);
  return updated;
}

/**
 * Remove um brandbook + arquivo físico se houver fileUrl no /uploads/.
 * @param {string} id
 * @param {string} tenantId
 */
async function deleteBrandbook(id, tenantId) {
  const row = await getBrandbookById(id, tenantId);
  if (!row) return false;

  // Tenta remover arquivo físico (best-effort)
  if (row.file_url && row.file_url.startsWith('/uploads/')) {
    try {
      const fullPath = path.join(process.cwd(), 'public', row.file_url);
      await fs.unlink(fullPath);
      console.log('[INFO][Brandbook] arquivo removido', { path: fullPath });
    } catch (err) {
      console.warn('[WARN][Brandbook] não foi possível remover arquivo', {
        path: row.file_url, error: err.message,
      });
    }
  }

  await query(
    `DELETE FROM client_brandbooks WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  invalidateBrandbookCache(row.client_id, tenantId);
  return true;
}

/**
 * Atualiza as fixed_references do brandbook (até 5 imagens da marca que
 * são SEMPRE injetadas como contexto visual em toda geração desse cliente).
 *
 * Invalida cache das descrições — vão ser recomputadas na próxima geração.
 *
 * Sprint v1.1 — abril 2026.
 *
 * @param {string} brandbookId
 * @param {string} tenantId
 * @param {Array<{url: string, label: string}>} fixedRefs
 */
async function updateFixedReferences(brandbookId, tenantId, fixedRefs) {
  if (!Array.isArray(fixedRefs)) throw new Error('fixedRefs deve ser array');
  if (fixedRefs.length > 5) throw new Error('Máximo de 5 referências fixas');

  for (const ref of fixedRefs) {
    if (!ref?.url || typeof ref.url !== 'string' || !ref.url.startsWith('/uploads/')) {
      throw new Error('URL inválida — deve ser /uploads/...');
    }
    if (ref.url.includes('..')) throw new Error('URL inválida (path traversal)');
    if (!ref.label || typeof ref.label !== 'string' || ref.label.length > 50) {
      throw new Error('Label obrigatório (max 50 chars)');
    }
  }

  // Invalida cache de descrições — vai recomputar na próxima geração
  const updated = await queryOne(
    `UPDATE client_brandbooks
        SET fixed_references = $1::jsonb,
            fixed_references_descriptions = '[]'::jsonb,
            fixed_references_described_at = NULL,
            updated_at = now()
      WHERE id = $2 AND tenant_id = $3
      RETURNING *`,
    [JSON.stringify(fixedRefs), brandbookId, tenantId]
  );
  if (updated?.client_id) invalidateBrandbookCache(updated.client_id, tenantId);
  return updated;
}

/**
 * Atualiza apenas o cache de descrições das fixed refs (chamado pelo worker
 * após chamar Vision em cada uma).
 *
 * @param {string} brandbookId
 * @param {Array<{url, label, description}>} descriptions
 */
async function updateFixedReferencesDescriptions(brandbookId, descriptions) {
  return queryOne(
    `UPDATE client_brandbooks
        SET fixed_references_descriptions = $1::jsonb,
            fixed_references_described_at = now()
      WHERE id = $2
      RETURNING id, fixed_references_described_at`,
    [JSON.stringify(descriptions || []), brandbookId]
  );
}

module.exports = {
  getActiveBrandbook,
  listBrandbookHistory,
  getBrandbookById,
  createBrandbook,
  updateBrandbook,
  deleteBrandbook,
  updateFixedReferences,
  updateFixedReferencesDescriptions,
  invalidateBrandbookCache,
};
