/**
 * models/contentPlanning/status.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD das colunas configuráveis do Kanban de Planejamento de Conteúdo.
 * Cada tenant possui seu próprio conjunto de status — semeado com 6 defaults
 * na primeira chamada via ensureDefaults().
 *
 * Tabela: content_plan_statuses (UNIQUE(tenant_id, key))
 *
 * Regras:
 *   · Multi-tenant: TODAS as queries filtram por tenant_id.
 *   · ensureDefaults é idempotente — só insere se o tenant ainda não tiver
 *     nenhum status cadastrado (transação implícita via INSERT ... ON CONFLICT).
 *   · deleteStatus bloqueia se houver planos usando OU se for is_default.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_STATUSES = [
  { key: 'pending',         label: 'Pendente',             color: '#94A3B8', sort_order: 0, is_default: true,  is_terminal: false },
  { key: 'in_development',  label: 'Em desenvolvimento',   color: '#F59E0B', sort_order: 1, is_default: false, is_terminal: false },
  { key: 'internal_review', label: 'Aprovação interna',    color: '#6366F1', sort_order: 2, is_default: false, is_terminal: false },
  { key: 'sent_to_client',  label: 'Enviado para o cliente', color: '#06B6D4', sort_order: 3, is_default: false, is_terminal: false },
  { key: 'client_review',   label: 'Aprovação cliente',    color: '#EC4899', sort_order: 4, is_default: false, is_terminal: false },
  { key: 'approved',        label: 'Aprovado',             color: '#10B981', sort_order: 5, is_default: false, is_terminal: false },
  { key: 'finalized',       label: 'Finalizado',           color: '#3B82F6', sort_order: 6, is_default: false, is_terminal: true  },
];

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Lista todos os status do tenant, ordenados por sort_order.
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
async function listStatuses(tenantId) {
  return query(
    `SELECT * FROM content_plan_statuses
      WHERE tenant_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
    [tenantId]
  );
}

/**
 * Retorna o status default (is_default = true) do tenant, ou null se não houver.
 * @param {string} tenantId
 * @returns {Promise<Object|null>}
 */
async function getDefaultStatus(tenantId) {
  return queryOne(
    `SELECT * FROM content_plan_statuses
      WHERE tenant_id = $1 AND is_default = true
      LIMIT 1`,
    [tenantId]
  );
}

/**
 * Busca um status pelo id (escopo de tenant).
 * @param {string} id
 * @param {string} tenantId
 * @returns {Promise<Object|null>}
 */
async function getStatusById(id, tenantId) {
  return queryOne(
    `SELECT * FROM content_plan_statuses
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

// ─── Seed (idempotente) ──────────────────────────────────────────────────────

/**
 * Garante que TODOS os status default existem para o tenant.
 * Aditivo: insere os que faltam, preserva os que já existem (ON CONFLICT DO NOTHING).
 * Pode rodar a cada request sem efeitos colaterais — novos defaults adicionados
 * em DEFAULT_STATUSES aparecem automaticamente para tenants existentes.
 *
 * @param {string} tenantId
 * @returns {Promise<Array>} statuses do tenant após o seed
 */
async function ensureDefaults(tenantId) {
  if (!tenantId) {
    console.log('[ERRO][ContentPlanning:Status] ensureDefaults sem tenantId');
    throw new Error('tenantId é obrigatório');
  }

  try {
    let inserted = 0;
    for (const s of DEFAULT_STATUSES) {
      const row = await query(
        `INSERT INTO content_plan_statuses
           (tenant_id, key, label, color, sort_order, is_default, is_terminal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, key) DO NOTHING
         RETURNING id`,
        [tenantId, s.key, s.label, s.color, s.sort_order, s.is_default, s.is_terminal]
      );
      if (row && row.length > 0) inserted++;
    }
    if (inserted > 0) {
      console.log('[SUCESSO][ContentPlanning:Status] defaults adicionados', { tenantId, inserted });
    }

    // Correção de ordem: garante que "Enviado para o cliente" fica ANTES de
    // "Aprovação cliente". Idempotente — só age quando a relação está invertida.
    const stc = await queryOne(
      `SELECT id, sort_order FROM content_plan_statuses WHERE tenant_id = $1 AND key = 'sent_to_client'`,
      [tenantId]
    );
    const cr = await queryOne(
      `SELECT id, sort_order FROM content_plan_statuses WHERE tenant_id = $1 AND key = 'client_review'`,
      [tenantId]
    );
    if (stc && cr && stc.sort_order >= cr.sort_order) {
      const target = cr.sort_order;
      // Bump tudo que tem sort_order >= target (exceto o próprio sent_to_client) em +1
      await query(
        `UPDATE content_plan_statuses
            SET sort_order = sort_order + 1, updated_at = now()
          WHERE tenant_id = $1 AND id <> $2 AND sort_order >= $3`,
        [tenantId, stc.id, target]
      );
      // sent_to_client toma a posição original do client_review
      await query(
        `UPDATE content_plan_statuses
            SET sort_order = $1, updated_at = now()
          WHERE id = $2`,
        [target, stc.id]
      );
      console.log('[SUCESSO][ContentPlanning:Status] sent_to_client reposicionado antes de client_review', { tenantId });
    }

    return listStatuses(tenantId);
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Status] ensureDefaults falhou', { tenantId, error: err.message });
    throw err;
  }
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria um novo status para o tenant.
 * @param {string} tenantId
 * @param {Object} fields - { key, label, color?, sort_order?, is_default?, is_terminal? }
 */
async function createStatus(tenantId, fields) {
  console.log('[INFO][ContentPlanning:Status] createStatus', { tenantId, key: fields?.key });

  if (!fields || !fields.key || !fields.label) {
    console.log('[ERRO][ContentPlanning:Status] createStatus payload inválido');
    throw new Error('key e label são obrigatórios');
  }

  try {
    const row = await queryOne(
      `INSERT INTO content_plan_statuses
         (tenant_id, key, label, color, sort_order, is_default, is_terminal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        String(fields.key).slice(0, 64),
        String(fields.label).slice(0, 120),
        fields.color || '#94A3B8',
        Number.isFinite(fields.sort_order) ? fields.sort_order : 0,
        Boolean(fields.is_default),
        Boolean(fields.is_terminal),
      ]
    );

    // Se o novo for is_default, garantir unicidade
    if (row.is_default) {
      await query(
        `UPDATE content_plan_statuses
            SET is_default = false
          WHERE tenant_id = $1 AND id <> $2`,
        [tenantId, row.id]
      );
    }

    console.log('[SUCESSO][ContentPlanning:Status] criado', { id: row.id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Status] createStatus falhou', { error: err.message });
    throw err;
  }
}

/**
 * Atualiza campos de um status. COALESCE preserva valores existentes quando null.
 * Se is_default for true, zera is_default dos outros do mesmo tenant.
 * @param {string} id
 * @param {string} tenantId
 * @param {Object} fields
 */
async function updateStatus(id, tenantId, fields) {
  console.log('[INFO][ContentPlanning:Status] updateStatus', { id, tenantId });

  try {
    const row = await queryOne(
      `UPDATE content_plan_statuses
          SET label       = COALESCE($3, label),
              color       = COALESCE($4, color),
              sort_order  = COALESCE($5, sort_order),
              is_default  = COALESCE($6, is_default),
              is_terminal = COALESCE($7, is_terminal),
              updated_at  = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [
        id,
        tenantId,
        fields?.label != null ? String(fields.label).slice(0, 120) : null,
        fields?.color != null ? String(fields.color).slice(0, 32) : null,
        Number.isFinite(fields?.sort_order) ? fields.sort_order : null,
        typeof fields?.is_default === 'boolean' ? fields.is_default : null,
        typeof fields?.is_terminal === 'boolean' ? fields.is_terminal : null,
      ]
    );

    if (!row) {
      console.log('[ERRO][ContentPlanning:Status] updateStatus não encontrou', { id, tenantId });
      return null;
    }

    if (row.is_default) {
      await query(
        `UPDATE content_plan_statuses
            SET is_default = false
          WHERE tenant_id = $1 AND id <> $2`,
        [tenantId, row.id]
      );
    }

    console.log('[SUCESSO][ContentPlanning:Status] atualizado', { id });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Status] updateStatus falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Remove um status. Bloqueia se:
 *   · houver content_plans usando esse status_id
 *   · status for is_default
 * @param {string} id
 * @param {string} tenantId
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function deleteStatus(id, tenantId) {
  console.log('[INFO][ContentPlanning:Status] deleteStatus', { id, tenantId });

  try {
    const status = await getStatusById(id, tenantId);
    if (!status) {
      console.log('[ERRO][ContentPlanning:Status] deleteStatus não encontrado', { id });
      return { ok: false, reason: 'not_found' };
    }

    if (status.is_default) {
      console.log('[ERRO][ContentPlanning:Status] não pode deletar default', { id });
      return { ok: false, reason: 'is_default' };
    }

    const inUse = await queryOne(
      `SELECT COUNT(*)::int AS count FROM content_plans
        WHERE tenant_id = $1 AND status_id = $2`,
      [tenantId, id]
    );

    if (inUse && inUse.count > 0) {
      console.log('[ERRO][ContentPlanning:Status] em uso', { id, count: inUse.count });
      return { ok: false, reason: 'in_use', count: inUse.count };
    }

    await query(
      `DELETE FROM content_plan_statuses
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    console.log('[SUCESSO][ContentPlanning:Status] removido', { id });
    return { ok: true };
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Status] deleteStatus falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Reordena statuses do tenant. Recebe array de ids na ordem desejada.
 * @param {string} tenantId
 * @param {string[]} orderedIds
 */
async function reorderStatuses(tenantId, orderedIds) {
  console.log('[INFO][ContentPlanning:Status] reorderStatuses', { tenantId, count: orderedIds?.length });

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    console.log('[ERRO][ContentPlanning:Status] reorderStatuses array vazio');
    throw new Error('orderedIds deve ser um array não-vazio');
  }

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await query(
        `UPDATE content_plan_statuses
            SET sort_order = $3, updated_at = now()
          WHERE id = $1 AND tenant_id = $2`,
        [orderedIds[i], tenantId, i]
      );
    }
    console.log('[SUCESSO][ContentPlanning:Status] reordenado', { tenantId, count: orderedIds.length });
    return listStatuses(tenantId);
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Status] reorderStatuses falhou', { error: err.message });
    throw err;
  }
}

module.exports = {
  DEFAULT_STATUSES,
  listStatuses,
  getStatusById,
  getDefaultStatus,
  ensureDefaults,
  createStatus,
  updateStatus,
  deleteStatus,
  reorderStatuses,
};
