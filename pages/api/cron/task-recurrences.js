/**
 * CRON: task-recurrences
 * Itera todas as recorrencias ativas e cria tasks reais para hoje quando aplicavel.
 * Idempotente: usa task_recurrences.last_run_at = hoje para evitar duplicar no mesmo dia.
 *
 * Frequencia recomendada: 1x por dia, junto ao morning (8h BRT = "0 11 * * *")
 * Protegido por x-internal-token.
 */
const { query } = require('../../../infra/db');
const recurrenceModel = require('../../../models/taskRecurrence.model');
const taskModel = require('../../../models/task.model');

function todayBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const internalToken = req.headers['x-internal-token'];
  if (internalToken !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  console.log('[CRON][task-recurrences] Início');
  const dueDate = todayBRT();
  let totalCreated = 0;
  const perTenant = {};

  try {
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);

    for (const tenant of tenants) {
      const due = await recurrenceModel.getDueToday(tenant.id);
      if (due.length === 0) continue;

      perTenant[tenant.id] = 0;

      for (const rec of due) {
        try {
          // Normaliza subtasks (vem como JSONB)
          const subs = Array.isArray(rec.subtasks)
            ? rec.subtasks
            : (rec.subtasks ? JSON.parse(rec.subtasks) : []);

          // Reseta o `done` das subtarefas — cada nova instancia comeca limpa
          const freshSubs = subs.map((s, i) => ({
            id: s.id || `rec_${Date.now()}_${i}`,
            title: s.title,
            done: false,
          }));

          await taskModel.createTask({
            title: rec.title,
            description: rec.description || null,
            client_id: rec.client_id || null,
            assigned_to: rec.assigned_to || null,
            priority: rec.priority || 'normal',
            due_date: dueDate,
            status: 'pending',
            category_id: rec.category_id || null,
            estimated_hours: null,
            created_by: rec.created_by || null,
            subtasks: freshSubs,
            subtasks_required: Boolean(rec.subtasks_required),
          }, tenant.id);

          await recurrenceModel.markRunToday(rec.id, tenant.id);
          totalCreated++;
          perTenant[tenant.id]++;
        } catch (err) {
          console.error(
            '[CRON][task-recurrences] Falha ao criar task da recorrencia',
            { tenantId: tenant.id, recurrenceId: rec.id, error: err.message }
          );
        }
      }
    }

    console.log('[CRON][task-recurrences] Fim', { totalCreated, perTenant });
    return res.json({ success: true, totalCreated, perTenant });
  } catch (err) {
    console.error('[ERRO][CRON][task-recurrences]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
