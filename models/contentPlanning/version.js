/**
 * models/contentPlanning/version.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Histórico de versões do planejamento. Cada versão é um snapshot JSON
 * do plano + criativos no momento da criação.
 *
 * Tabela: content_plan_versions  (UNIQUE(plan_id, version_no))
 *
 * Regra de segurança: restoreVersion sempre cria PRIMEIRO uma versão do
 * estado atual (trigger='restore_safety') ANTES de aplicar o snapshot
 * escolhido — assim nada é perdido.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const activity = require('./activity');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function buildSnapshot(planId, tenantId) {
  const plan = await queryOne(
    `SELECT * FROM content_plans WHERE id = $1 AND tenant_id = $2`,
    [planId, tenantId]
  );
  if (!plan) return null;

  const creatives = await query(
    `SELECT * FROM content_plan_creatives
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [planId, tenantId]
  );

  return { plan, creatives };
}

async function nextVersionNo(planId) {
  const row = await queryOne(
    `SELECT COALESCE(MAX(version_no), 0) AS max_no
       FROM content_plan_versions WHERE plan_id = $1`,
    [planId]
  );
  return (row?.max_no || 0) + 1;
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

async function listVersions(planId, tenantId) {
  return query(
    `SELECT id, plan_id, version_no, label, trigger, created_by, created_at
       FROM content_plan_versions
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY version_no DESC`,
    [planId, tenantId]
  );
}

async function getVersionById(id, tenantId) {
  return queryOne(
    `SELECT * FROM content_plan_versions
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria nova versão a partir do estado atual.
 *
 * @param {string} tenantId
 * @param {string} planId
 * @param {Object} opts
 * @param {string} [opts.label]
 * @param {string} [opts.trigger]   - manual | client_rejected | share_link_created | restore_safety
 * @param {string} [opts.createdBy]
 */
async function createVersion(tenantId, planId, { label, trigger, createdBy } = {}) {
  console.log('[INFO][ContentPlanning:Version] createVersion', { tenantId, planId, trigger });

  try {
    const snapshot = await buildSnapshot(planId, tenantId);
    if (!snapshot) {
      console.log('[ERRO][ContentPlanning:Version] plan não encontrado', { planId });
      throw new Error('plan_not_found');
    }

    const versionNo = await nextVersionNo(planId);

    const row = await queryOne(
      `INSERT INTO content_plan_versions
         (tenant_id, plan_id, version_no, label, snapshot, created_by, trigger)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        planId,
        versionNo,
        label || `v${versionNo}`,
        JSON.stringify(snapshot),
        createdBy || null,
        trigger || 'manual',
      ]
    );

    await activity.logActivity(tenantId, planId, {
      actorType: 'internal',
      actorId: createdBy || null,
      eventType: 'version_saved',
      payload: { version_id: row.id, version_no: row.version_no, trigger: row.trigger },
    });

    console.log('[SUCESSO][ContentPlanning:Version] criada', { id: row.id, versionNo });
    return row;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Version] createVersion falhou', { error: err.message });
    throw err;
  }
}

/**
 * Restaura uma versão. PRIMEIRO cria snapshot do estado atual (segurança),
 * depois substitui plan + creatives pelo snapshot da versão escolhida.
 *
 * @param {string} id          - id da versão a restaurar
 * @param {string} tenantId
 * @param {string} createdBy   - quem está restaurando
 */
async function restoreVersion(id, tenantId, createdBy) {
  console.log('[INFO][ContentPlanning:Version] restoreVersion', { id, tenantId });

  try {
    const version = await getVersionById(id, tenantId);
    if (!version) {
      console.log('[ERRO][ContentPlanning:Version] versão não encontrada', { id });
      throw new Error('version_not_found');
    }

    const planId = version.plan_id;

    // 1. Snapshot de segurança ANTES de mexer
    await createVersion(tenantId, planId, {
      label: `Antes de restaurar v${version.version_no}`,
      trigger: 'restore_safety',
      createdBy: createdBy || null,
    });

    // 2. Aplica o snapshot da versão escolhida
    const snap = typeof version.snapshot === 'string'
      ? JSON.parse(version.snapshot)
      : version.snapshot;

    if (!snap || !snap.plan) {
      console.log('[ERRO][ContentPlanning:Version] snapshot inválido', { id });
      throw new Error('invalid_snapshot');
    }

    const p = snap.plan;
    await query(
      `UPDATE content_plans
          SET title           = $3,
              month_reference = $4,
              objective       = $5,
              central_promise = $6,
              strategy_notes  = $7,
              status_id       = $8,
              owner_id        = $9,
              due_date        = $10,
              metadata        = $11,
              updated_at      = now()
        WHERE id = $1 AND tenant_id = $2`,
      [
        planId,
        tenantId,
        p.title,
        p.month_reference || null,
        p.objective || null,
        p.central_promise || null,
        p.strategy_notes || null,
        p.status_id || null,
        p.owner_id || null,
        p.due_date || null,
        JSON.stringify(p.metadata || {}),
      ]
    );

    // Substitui criativos: apaga todos e reinsere (preserva ids antigos não compensa)
    await query(
      `DELETE FROM content_plan_creatives
        WHERE plan_id = $1 AND tenant_id = $2`,
      [planId, tenantId]
    );

    if (Array.isArray(snap.creatives)) {
      for (const c of snap.creatives) {
        await query(
          `INSERT INTO content_plan_creatives
             (tenant_id, plan_id, sort_order, type, scheduled_for, scheduled_time,
              media_urls, video_url, cover_url, caption, cta, hashtags,
              internal_notes, copy_session_id, client_decision, client_rating,
              client_reason, client_notes, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            tenantId,
            planId,
            Number.isFinite(c.sort_order) ? c.sort_order : 0,
            c.type || 'post',
            c.scheduled_for || null,
            c.scheduled_time || null,
            JSON.stringify(c.media_urls || []),
            c.video_url || null,
            c.cover_url || null,
            c.caption || null,
            c.cta || null,
            c.hashtags || null,
            c.internal_notes || null,
            c.copy_session_id || null,
            c.client_decision || null,
            Number.isFinite(c.client_rating) ? c.client_rating : null,
            c.client_reason || null,
            c.client_notes || null,
            c.decided_at || null,
          ]
        );
      }
    }

    await activity.logActivity(tenantId, planId, {
      actorType: 'internal',
      actorId: createdBy || null,
      eventType: 'version_saved',
      payload: { restored_from: version.version_no, version_id: version.id },
    });

    console.log('[SUCESSO][ContentPlanning:Version] restaurada', { id, planId });
    return buildSnapshot(planId, tenantId);
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Version] restoreVersion falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Remove uma versão específica do histórico.
 * @param {string} id        - id da versão
 * @param {string} tenantId
 * @returns {Promise<boolean>} true se removeu
 */
async function deleteVersion(id, tenantId) {
  console.log('[INFO][ContentPlanning:Version] deleteVersion', { id, tenantId });
  try {
    const row = await queryOne(
      `DELETE FROM content_plan_versions
        WHERE id = $1 AND tenant_id = $2
        RETURNING id`,
      [id, tenantId]
    );
    if (!row) {
      console.log('[ERRO][ContentPlanning:Version] deleteVersion não encontrado', { id });
      return false;
    }
    console.log('[SUCESSO][ContentPlanning:Version] removida', { id });
    return true;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Version] deleteVersion falhou', { id, error: err.message });
    throw err;
  }
}

/**
 * Limpa TODAS as versões de um plano.
 * @param {string} planId
 * @param {string} tenantId
 * @returns {Promise<number>} quantidade removida
 */
async function clearAllVersions(planId, tenantId) {
  console.log('[INFO][ContentPlanning:Version] clearAllVersions', { planId, tenantId });
  try {
    const rows = await query(
      `DELETE FROM content_plan_versions
        WHERE plan_id = $1 AND tenant_id = $2
        RETURNING id`,
      [planId, tenantId]
    );
    const count = rows.length;
    console.log('[SUCESSO][ContentPlanning:Version] histórico limpo', { planId, count });
    return count;
  } catch (err) {
    console.log('[ERRO][ContentPlanning:Version] clearAllVersions falhou', { planId, error: err.message });
    throw err;
  }
}

module.exports = {
  createVersion,
  listVersions,
  getVersionById,
  restoreVersion,
  deleteVersion,
  clearAllVersions,
};
