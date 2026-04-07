/**
 * @fileoverview POST /api/jarvis/confirm
 * Executa ações que exigem confirmação prévia do usuário (criadas como
 * preview pelo /api/jarvis/command).
 *
 * Body: { action: 'create_task' | 'save_income' | 'save_expense' | 'generate_summary',
 *         data: object }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { query, queryOne } from '../../../infra/db';
import { logJarvisUsage } from '../../../models/jarvis/rateLimit';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/jarvis/confirm] Requisição', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const session = verifyToken(req.cookies?.sigma_token);
  if (!session) return res.status(401).json({ success: false, error: 'Não autenticado.' });

  try {
    const tenantId = await resolveTenantId(req);
    const user = await queryOne(`SELECT id, name, role FROM tenants WHERE id = $1`, [session.userId]);
    if (!user) return res.status(401).json({ success: false, error: 'Sessão inválida.' });

    const { action, data } = req.body || {};
    if (!action || !data) return res.status(400).json({ success: false, error: 'action e data obrigatórios' });

    /* ── CREATE TASK ───────────────────────────────────────── */
    if (action === 'create_task') {
      if (!data.title || !data.client_id) {
        // tarefa sem cliente: armazena em um cliente "fantasma"? — política aqui
        // exige client_id obrigatório, então retornamos erro claro.
        if (!data.title) return res.status(400).json({ success: false, error: 'Título obrigatório.' });
        if (!data.client_id) return res.status(400).json({ success: false, error: 'Tarefa precisa estar vinculada a um cliente.' });
      }
      const row = await queryOne(
        `INSERT INTO client_tasks
          (client_id, title, description, priority, due_date,
           assigned_to, created_by, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.client_id,
          data.title,
          data.description || null,
          data.priority || 'normal',
          data.due_date || null,
          data.assigned_to || user.id,
          user.id,
          tenantId,
        ]
      );
      console.log('[SUCESSO][Jarvis:Confirm] Tarefa criada', { id: row.id });
      await logJarvisUsage(tenantId, user.id, 'confirm:create_task', JSON.stringify(data), `task ${row.id}`, 0, true, null);
      return res.json({ success: true, message: 'Tarefa criada.', task: row });
    }

    /* ── SAVE INCOME / EXPENSE ─────────────────────────────── */
    if (action === 'save_income' || action === 'save_expense') {
      const type = action === 'save_income' ? 'income' : 'expense';
      if (!data.description || !Number.isFinite(Number(data.value))) {
        return res.status(400).json({ success: false, error: 'description e value obrigatórios' });
      }
      const date = data.date || new Date().toISOString().slice(0, 10);
      const row = await queryOne(
        `INSERT INTO company_finances (tenant_id, type, category, description, value, date)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [tenantId, type, data.category || null, data.description, Number(data.value), date]
      );
      console.log('[SUCESSO][Jarvis:Confirm] Lançamento salvo', { type, id: row.id });
      await logJarvisUsage(tenantId, user.id, `confirm:${action}`, JSON.stringify(data), `finance ${row.id}`, 0, true, null);
      return res.json({ success: true, message: type === 'income' ? 'Receita registrada.' : 'Despesa registrada.', entry: row });
    }

    /* ── GENERATE SUMMARY (dispara endpoint existente) ────── */
    if (action === 'generate_summary') {
      if (!data.client_id) return res.status(400).json({ success: false, error: 'client_id obrigatório' });
      // Encaminha internamente: o endpoint existente cuida do trabalho pesado.
      // Aqui apenas retornamos OK e o frontend redireciona/abre o resumo.
      console.log('[SUCESSO][Jarvis:Confirm] Resumo IA solicitado', { clientId: data.client_id });
      await logJarvisUsage(tenantId, user.id, 'confirm:generate_summary', JSON.stringify(data), 'queued', 0, true, null);
      return res.json({
        success: true,
        message: 'Geração de resumo solicitada. Acesse o cliente para acompanhar.',
        clientId: data.client_id,
      });
    }

    return res.status(400).json({ success: false, error: 'Ação desconhecida' });
  } catch (err) {
    console.error('[ERRO][API:/api/jarvis/confirm] Falha', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
