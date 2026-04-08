/**
 * POST /api/onboarding/admin/set-day
 * Avança ou retrocede o dia do onboarding de um cliente (god only).
 *
 * Body: { clientId, targetDay: 1-15 }
 *
 * Funciona alterando o started_at para que computeCurrentDay() retorne targetDay.
 * Não apaga respostas — o cliente pode ter etapas já respondidas em dias anteriores.
 */

import { requireRole } from '../../../../infra/checkRole';
import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { queryOne } from '../../../../infra/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

  try {
    await requireRole(req, 'god');
    const tenantId = await resolveTenantId(req);
    const { clientId, targetDay } = req.body || {};

    if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório.' });

    const day = parseInt(targetDay, 10);
    if (!Number.isFinite(day) || day < 1 || day > 15) {
      return res.status(400).json({ success: false, error: 'targetDay deve ser entre 1 e 15.' });
    }

    // Verifica se o cliente pertence ao tenant
    const client = await queryOne(
      `SELECT id, company_name FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });

    // Verifica se tem onboarding
    const progress = await queryOne(
      `SELECT id, started_at, current_day, current_stage, status FROM onboarding_progress WHERE client_id = $1`,
      [clientId]
    );
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Onboarding não iniciado para este cliente.' });
    }

    // Calcula novo started_at: hoje BRT - (targetDay - 1) dias
    // Usa timezone BRT para consistência com computeCurrentDay()
    const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const newStart = new Date(nowBRT);
    newStart.setDate(newStart.getDate() - (day - 1));
    newStart.setHours(0, 0, 0, 0);

    const updated = await queryOne(
      `UPDATE onboarding_progress
       SET started_at = $2,
           current_day = $3,
           status = CASE WHEN $3 <= 15 AND status = 'completed' THEN 'active' ELSE status END
       WHERE client_id = $1
       RETURNING id, started_at, current_day, current_stage, status`,
      [clientId, newStart.toISOString(), day]
    );

    console.log('[INFO][Onboarding:SetDay]', {
      clientId, clientName: client.company_name,
      previousDay: progress.current_day, newDay: day,
      newStartedAt: newStart.toISOString(),
    });

    return res.json({
      success: true,
      message: `Dia do onboarding de ${client.company_name} alterado para dia ${day}.`,
      progress: {
        clientId,
        clientName: client.company_name,
        previousDay: progress.current_day,
        currentDay: day,
        startedAt: updated.started_at,
        status: updated.status,
      },
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[ERRO][API:/api/onboarding/admin/set-day]', err.message);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
