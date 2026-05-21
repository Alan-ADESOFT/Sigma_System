/**
 * pages/api/tasks/bulk-import/commit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/tasks/bulk-import/commit
 *
 * Recebe o array final de tasks (já revisado pelo usuário no preview) e cria
 * todas de uma vez via taskModel.createMany (INSERT batch atômico).
 *
 * Validações ficam concentradas no model — aqui só transformamos o payload e
 * tratamos auth + tenant. A intenção é manter este handler "burro" e o model
 * como fonte da verdade pras regras.
 *
 * Retorno:
 *   { success, created: number, tasks: [...], failed: [{ index, error }] }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth } = require('../../../../lib/api-auth');
const taskModel = require('../../../../models/task.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma tarefa enviada.' });
    }
    if (tasks.length > 200) {
      return res.status(400).json({ success: false, error: 'Máximo de 200 tarefas por importação.' });
    }

    // Normaliza payload — created_by é sempre o usuário logado, jamais
    // confiado do client. A data não pode ser anterior a hoje.
    const todayStr = new Date().toISOString().slice(0, 10);
    const items = tasks.map((t) => {
      const due_date = t?.due_date && String(t.due_date) >= todayStr ? t.due_date : null;
      return {
        title: t?.title,
        description: t?.description || null,
        client_id: t?.client_id || null,
        assigned_to: t?.assigned_to || user.id,
        category_id: t?.category_id || null,
        priority: t?.priority || 'normal',
        due_date,
        due_time: t?.due_time || null,
        status: 'pending',
        subtasks: Array.isArray(t?.subtasks) ? t.subtasks : [],
        subtasks_required: false,
        created_by: user.id,
      };
    });

    const { created, failed } = await taskModel.createMany(items, tenantId);

    // Notificações pra responsáveis (best-effort, agrupado por user — uma
    // notificação por pessoa ao invés de N).
    try {
      const { createNotification } = require('../../../../models/clientForm');
      const byAssignee = {};
      for (const t of created) {
        if (t.assigned_to && t.assigned_to !== user.id) {
          byAssignee[t.assigned_to] = (byAssignee[t.assigned_to] || 0) + 1;
        }
      }
      for (const [uid, count] of Object.entries(byAssignee)) {
        await createNotification(
          uid, 'task_assigned',
          'Tarefas atribuídas',
          `${count} tarefa(s) foram atribuídas a você via importação em massa`,
          null,
          { source: 'bulk_import', count }
        );
      }
    } catch (err) {
      console.warn('[WARN][bulkImport/commit] notificações falharam', err.message);
    }

    console.log('[SUCESSO][bulkImport/commit]', {
      userId: user.id, created: created.length, failed: failed.length,
    });

    return res.json({
      success: true,
      created: created.length,
      tasks: created,
      failed,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][bulkImport/commit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
