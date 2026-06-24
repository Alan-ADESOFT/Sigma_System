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
const { requireAdmin } = require('../../../../lib/api-auth');
const taskModel = require('../../../../models/task.model');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    // Importação em massa é restrita a admin/god.
    const user = await requireAdmin(req);
    const tenantId = await resolveTenantId(req);

    const { tasks, meetings } = req.body || {};
    const meetingList = Array.isArray(meetings) ? meetings : [];
    if ((!Array.isArray(tasks) || tasks.length === 0) && meetingList.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma tarefa ou reunião enviada.' });
    }
    if (Array.isArray(tasks) && tasks.length > 200) {
      return res.status(400).json({ success: false, error: 'Máximo de 200 tarefas por importação.' });
    }

    // Normaliza payload — created_by é sempre o usuário logado, jamais
    // confiado do client. A data não pode ser anterior a hoje.
    const todayStr = new Date().toISOString().slice(0, 10);
    const items = (Array.isArray(tasks) ? tasks : []).map((t) => {
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

    const { created, failed } = items.length > 0
      ? await taskModel.createMany(items, tenantId)
      : { created: [], failed: [] };

    // Reuniões (best-effort, em paralelo — sem transação no codebase).
    const meetingModel = require('../../../../models/meeting.model');
    const meetingResults = await Promise.all(meetingList.map(async (m, i) => {
      if (!m?.title?.trim() || !m?.meeting_date) {
        return { ok: false, index: i, error: 'título e data são obrigatórios' };
      }
      try {
        const row = await meetingModel.createMeeting({
          title: m.title.trim(),
          description: m.description || null,
          meeting_date: m.meeting_date,
          start_time: m.start_time || '09:00',
          end_time: null,
          client_id: m.client_id || null,
          participants: Array.isArray(m.participants) ? m.participants : [],
          status: 'scheduled',
          meet_link: null,
          obs: null,
          created_by: user.id,
        }, tenantId);
        return { ok: true, row };
      } catch (err) {
        console.error('[ERRO][bulkImport/commit] reunião falhou', { index: i, error: err.message });
        return { ok: false, index: i, error: err.message };
      }
    }));
    const createdMeetings = meetingResults.filter((r) => r.ok).map((r) => r.row);
    const failedMeetings = meetingResults.filter((r) => !r.ok).map((r) => ({ index: r.index, error: r.error }));

    // Notificações pra responsáveis (best-effort, agrupado por user — uma
    // notificação por pessoa ao invés de N).
    try {
      const { createUserNotification, createNotification } = require('../../../../models/clientForm');
      const byAssignee = {};
      for (const t of created) {
        if (t.assigned_to && t.assigned_to !== user.id) {
          byAssignee[t.assigned_to] = (byAssignee[t.assigned_to] || 0) + 1;
        }
      }
      // Notificações em paralelo. Pessoal — cada assignee só vê o próprio bloco;
      // reuniões → broadcast (todo time vê na agenda).
      await Promise.all([
        ...Object.entries(byAssignee).map(([uid, count]) =>
          createUserNotification(
            uid, tenantId, 'task_assigned',
            'Tarefas atribuídas',
            `${count} tarefa(s) foram atribuídas a você via importação em massa`,
            null,
            { source: 'bulk_import', count }
          )
        ),
        createdMeetings.length > 0
          ? createNotification(
              tenantId, 'meeting_created',
              'Reuniões criadas',
              `${createdMeetings.length} reunião(ões) criada(s) via importação de ata`,
              null,
              { source: 'bulk_import', count: createdMeetings.length }
            )
          : null,
      ].filter(Boolean));
    } catch (err) {
      console.warn('[WARN][bulkImport/commit] notificações falharam', err.message);
    }

    console.log('[SUCESSO][bulkImport/commit]', {
      userId: user.id, created: created.length, failed: failed.length,
      meetings: createdMeetings.length, failedMeetings: failedMeetings.length,
    });

    return res.json({
      success: true,
      created: created.length,
      tasks: created,
      failed,
      createdMeetings: createdMeetings.length,
      meetings: createdMeetings,
      failedMeetings,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][bulkImport/commit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
