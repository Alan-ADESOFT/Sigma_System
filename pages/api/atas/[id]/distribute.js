/**
 * pages/api/atas/[id]/distribute.js
 * POST → distribui: cada afazer (com responsável, não "próxima semana", ainda
 * sem task) vira uma client_tasks real do time. Notifica cada responsável.
 */
const { requireAuth, handleAuthError } = require('../../../../lib/api-auth');
const model = require('../../../../models/ata.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });
  let user;
  try { user = await requireAuth(req); }
  catch (err) { if (handleAuthError(res, err)) return; return res.status(500).json({ success: false, error: err.message }); }
  const tenantId = user.tenant_id;
  const { id } = req.query;

  try {
    const result = await model.distributeAta(id, tenantId, user.id);

    // Notifica cada responsável (pessoal) — agrupado, best-effort.
    try {
      const { createUserNotification } = require('../../../../models/clientForm');
      const byAssignee = {};
      for (const t of (result.created || [])) {
        if (t.assigned_to && t.assigned_to !== user.id) byAssignee[t.assigned_to] = (byAssignee[t.assigned_to] || 0) + 1;
      }
      for (const [uid, count] of Object.entries(byAssignee)) {
        await createUserNotification(uid, tenantId, 'task_assigned', 'Afazeres da ata',
          `${count} afazer(es) da ata semanal foram atribuídos a você.`, null, { source: 'ata', count });
      }
    } catch (e) {
      console.warn('[WARN][API:/api/atas/distribute] notificação falhou', e.message);
    }

    return res.json({ success: true, distributed: result.distributed, failed: result.failed });
  } catch (err) {
    const status = /não encontrad/i.test(err.message) ? 404 : 500;
    console.error('[ERRO][API:/api/atas/[id]/distribute]', err.message);
    return res.status(status).json({ success: false, error: err.message });
  }
}
