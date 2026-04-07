/**
 * pages/api/dashboard/summary.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint agregado do dashboard principal.
 * Retorna todos os KPIs em uma unica chamada com Promise.all.
 * Cache de 60 segundos.
 *
 * GET /api/dashboard/summary
 * → { clientsCount, activeClients, pendingTasks, overdueTasks,
 *     overdueInstallments, revenueThisMonth, pipelineRunning, unreadNotifications }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { queryOne } from '../../../infra/db';
import { getOrSet } from '../../../infra/cache';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);

    const data = await getOrSet(`dashboard:summary:${tenantId}`, async () => {
      const [
        clientsRow,
        tasksRow,
        installmentsRow,
        revenueRow,
        pipelineRow,
        notifRow,
      ] = await Promise.all([
        // Contagem de clientes total + ativos
        queryOne(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active
          FROM marketing_clients
          WHERE tenant_id = $1
        `, [tenantId]),

        // Tarefas pendentes + atrasadas
        queryOne(`
          SELECT
            COUNT(*) FILTER (WHERE done = false)::int AS pending,
            COUNT(*) FILTER (WHERE done = false AND due_date < CURRENT_DATE)::int AS overdue
          FROM client_tasks
          WHERE tenant_id = $1
        `, [tenantId]),

        // Parcelas atrasadas
        queryOne(`
          SELECT COUNT(*)::int AS overdue
          FROM client_installments ci
          JOIN marketing_clients mc ON mc.id = ci.client_id
          WHERE mc.tenant_id = $1
            AND ci.status = 'pending'
            AND ci.due_date < CURRENT_DATE
        `, [tenantId]),

        // Receita do mes atual (parcelas pagas)
        queryOne(`
          SELECT COALESCE(SUM(ci.value), 0)::numeric AS total
          FROM client_installments ci
          JOIN marketing_clients mc ON mc.id = ci.client_id
          WHERE mc.tenant_id = $1
            AND ci.status = 'paid'
            AND ci.paid_at >= date_trunc('month', CURRENT_DATE)
        `, [tenantId]),

        // Pipeline rodando
        queryOne(`
          SELECT COUNT(*)::int AS running
          FROM pipeline_jobs
          WHERE tenant_id = $1 AND status = 'running'
        `, [tenantId]),

        // Notificacoes nao lidas
        queryOne(`
          SELECT COUNT(*)::int AS unread
          FROM system_notifications
          WHERE tenant_id = $1 AND read = false
        `, [tenantId]),
      ]);

      return {
        clientsCount:        clientsRow?.total || 0,
        activeClients:       clientsRow?.active || 0,
        pendingTasks:        tasksRow?.pending || 0,
        overdueTasks:        tasksRow?.overdue || 0,
        overdueInstallments: installmentsRow?.overdue || 0,
        revenueThisMonth:    parseFloat(revenueRow?.total) || 0,
        pipelineRunning:     (pipelineRow?.running || 0) > 0,
        unreadNotifications: notifRow?.unread || 0,
      };
    }, 60);

    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ERRO][API:dashboard/summary]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
