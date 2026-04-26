/**
 * server/comercialCleanup.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Job de limpeza periódica do módulo comercial.
 *  · Deleta listas expiradas (status completed/failed) — TTL configurável
 *    via setting comercial_list_ttl_days (default 5 dias).
 *
 * Chamado por /api/cron/comercial-cleanup (interno, protegido).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

async function runCleanupCycle() {
  console.log('[INFO][server/comercialCleanup:runCleanupCycle] Iniciando');

  try {
    const beforeRow = await queryOne(
      `SELECT COUNT(*)::int AS c
         FROM comercial_lead_lists
        WHERE expires_at < now()
          AND status IN ('completed', 'failed')`
    );
    const willDelete = beforeRow?.c || 0;

    if (willDelete > 0) {
      await query(
        `DELETE FROM comercial_lead_lists
          WHERE expires_at < now()
            AND status IN ('completed', 'failed')`
      );
    }

    console.log('[SUCESSO][server/comercialCleanup:runCleanupCycle]', { listsDeleted: willDelete });
    return { listsDeleted: willDelete };
  } catch (err) {
    console.error('[ERRO][server/comercialCleanup:runCleanupCycle]', { error: err.message, stack: err.stack });
    throw err;
  }
}

module.exports = { runCleanupCycle };
