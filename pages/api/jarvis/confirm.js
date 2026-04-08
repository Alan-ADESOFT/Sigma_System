/**
 * @fileoverview POST /api/jarvis/confirm
 * Executa ações que exigem confirmação prévia do usuário (criadas como
 * preview pelo /api/jarvis/command).
 *
 * Body: { action: 'create_task' | 'save_income' | 'save_expense' | 'generate_summary',
 *         data: object }
 *
 * Todas as ações geram notificação interna no sistema apos execução.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { query, queryOne } from '../../../infra/db';
import { logJarvisUsage } from '../../../models/jarvis/rateLimit';
import { createNotification } from '../../../models/clientForm';
import { invalidate } from '../../../infra/cache';

/**
 * Helper para retornar erros do Jarvis com 2 mensagens separadas:
 *   - error       → mensagem técnica completa (vai pro log do dev / DevTools)
 *   - userMessage → frase curta e amigável que o JarvisOrb vai falar via TTS
 *
 * O frontend prioriza userMessage quando existir, evitando que o usuário
 * ouça stack traces ou mensagens de erro de banco via voz sintetizada.
 */
function jarvisError(res, status, technicalError, userMessage) {
  return res.status(status).json({
    success: false,
    error: technicalError,
    userMessage: userMessage || 'Não consegui completar essa ação. Tente novamente daqui a pouco.',
  });
}

export default async function handler(req, res) {
  console.log('[INFO][API:/api/jarvis/confirm] Requisição', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const session = verifyToken(req.cookies?.sigma_token);
  if (!session) {
    return jarvisError(res, 401, 'Não autenticado', 'Você precisa estar logado pra eu fazer isso.');
  }

  try {
    const tenantId = await resolveTenantId(req);
    const user = await queryOne(`SELECT id, name, role FROM tenants WHERE id = $1`, [session.userId]);
    if (!user) {
      return jarvisError(res, 401, 'Sessão inválida', 'Sua sessão expirou. Faça login de novo.');
    }

    const { action, data } = req.body || {};
    if (!action || !data) {
      return jarvisError(res, 400, 'action e data obrigatórios', 'Ação inválida. Tente pedir de novo.');
    }

    /* ── CREATE TASK ───────────────────────────────────────── */
    if (action === 'create_task') {
      if (!data.title) {
        return jarvisError(res, 400, 'Título obrigatório', 'Não consegui pegar o título da tarefa. Pode repetir?');
      }

      // ── Recorrente: cria em task_recurrences (cron gera as instâncias) ──
      if (data.is_recurring) {
        const { createRecurrence } = require('../../../models/taskRecurrence.model');

        try {
          const recurrence = await createRecurrence({
            title:             data.title,
            description:       data.description || null,
            priority:          data.priority || 'normal',
            category_id:       data.category_id || null,
            assigned_to:       data.assigned_to || user.id,
            client_id:         data.client_id || null,
            frequency:         data.frequency || 'weekly',
            weekday:           data.weekday,
            day_of_month:      data.day_of_month,
            is_active:         true,
            created_by:        user.id,
            subtasks:          data.subtasks || [],
            subtasks_required: data.subtasks_required || false,
          }, tenantId);

          console.log('[SUCESSO][Jarvis:Confirm] Recorrência criada', { id: recurrence.id });
          await logJarvisUsage(tenantId, user.id, 'confirm:create_recurring_task',
            JSON.stringify(data), `recurrence ${recurrence.id}`, 0, true, null);

          const WEEKDAY_NAMES = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
          const freqLabel =
            data.frequency === 'daily'  ? 'diariamente' :
            data.frequency === 'weekly' ? `toda ${WEEKDAY_NAMES[data.weekday] || 'semana'}` :
                                          `todo dia ${data.day_of_month}`;

          try { await invalidate(`task_recurrences:${tenantId}`); } catch {}

          try {
            await createNotification(
              tenantId, 'jarvis_action', 'Task recorrente criada via JARVIS',
              `"${data.title}" — ${freqLabel}${data.client_name ? `, cliente: ${data.client_name}` : ''}.`,
              data.client_id || null,
              { action: 'create_recurring_task', recurrenceId: recurrence.id, createdBy: 'jarvis' }
            );
          } catch {}

          return res.json({
            success: true,
            message: `Task recorrente "${data.title}" criada (${freqLabel}).`,
          });
        } catch (err) {
          console.error('[ERRO][Jarvis:Confirm] Falha ao criar recorrência', err);
          return jarvisError(
            res, 500,
            'Falha ao criar task recorrente: ' + err.message,
            'Não consegui salvar essa task recorrente. Tenta de novo daqui a pouco.'
          );
        }
      }

      // ── Task normal (pontual) ──
      try {
        const row = await queryOne(
          `INSERT INTO client_tasks
            (client_id, title, description, priority, due_date, status,
             category_id, subtasks, subtasks_required,
             assigned_to, created_by, tenant_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
           RETURNING *`,
          [
            data.client_id || null,
            data.title,
            data.description || null,
            data.priority || 'normal',
            data.due_date || null,
            'pending',
            data.category_id || null,
            JSON.stringify(data.subtasks || []),
            data.subtasks_required || false,
            data.assigned_to || user.id,
            user.id,
            tenantId,
          ]
        );
        console.log('[SUCESSO][Jarvis:Confirm] Tarefa criada', { id: row.id });
        await logJarvisUsage(tenantId, user.id, 'confirm:create_task', JSON.stringify(data), `task ${row.id}`, 0, true, null);

        try { await invalidate(`tasks:${tenantId}`); } catch {}

        try {
          await createNotification(
            tenantId, 'jarvis_action', 'Tarefa criada via JARVIS',
            `"${data.title}"${data.client_name ? ` para ${data.client_name}` : ''}${data.assigned_to_name ? `, atribuída a ${data.assigned_to_name}` : ''}${data.category_name ? ` [${data.category_name}]` : ''}.`,
            data.client_id || null, { action: 'create_task', taskId: row.id, createdBy: 'jarvis' }
          );
        } catch {}

        return res.json({ success: true, message: `Tarefa "${data.title}" criada com sucesso.`, task: row });
      } catch (err) {
        console.error('[ERRO][Jarvis:Confirm] Falha ao criar task', err);
        return jarvisError(
          res, 500,
          'Falha ao criar tarefa: ' + err.message,
          'Não consegui salvar essa tarefa agora. Tenta de novo em alguns segundos.'
        );
      }
    }

    /* ── SAVE INCOME / EXPENSE ─────────────────────────────── */
    if (action === 'save_income' || action === 'save_expense') {
      const type = action === 'save_income' ? 'income' : 'expense';
      const typeLabel = type === 'income' ? 'Receita' : 'Despesa';
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

      const valueFmt = Number(data.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      try {
        await createNotification(
          tenantId, 'jarvis_action', `${typeLabel} registrada via JARVIS`,
          `${data.description} — ${valueFmt} em ${new Date(date).toLocaleDateString('pt-BR')}.`,
          null, { action, financeId: row.id, createdBy: 'jarvis' }
        );
      } catch {}

      return res.json({ success: true, message: `${typeLabel} registrada.`, entry: row });
    }

    /* ── GENERATE SUMMARY / RUN PIPELINE ────────────────────── */
    if (action === 'generate_summary') {
      if (!data.client_id) return res.status(400).json({ success: false, error: 'client_id obrigatório' });

      // Dispara o pipeline via chamada interna
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
      let pipelineResult = null;
      try {
        const r = await fetch(`${baseUrl}/api/agentes/pipeline/run-all`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': process.env.INTERNAL_API_TOKEN || '',
          },
          body: JSON.stringify({ clientId: data.client_id }),
        });
        pipelineResult = await r.json();
        console.log('[SUCESSO][Jarvis:Confirm] Pipeline disparado', { clientId: data.client_id, jobId: pipelineResult?.jobId });
      } catch (err) {
        console.error('[ERRO][Jarvis:Confirm] Falha ao disparar pipeline', { error: err.message });
        return res.status(500).json({ success: false, error: 'Falha ao disparar o pipeline: ' + err.message });
      }

      if (!pipelineResult?.success) {
        return res.status(400).json({ success: false, error: pipelineResult?.error || 'Falha ao iniciar pipeline.' });
      }

      await logJarvisUsage(tenantId, user.id, 'confirm:generate_summary', JSON.stringify(data), `job ${pipelineResult.jobId}`, 0, true, null);
      invalidate(`clients:list:${tenantId}`);

      try {
        await createNotification(
          tenantId, 'jarvis_action', 'Pipeline disparado via JARVIS',
          `Pipeline de ${data.client_name || 'cliente'} iniciado. Acompanhe na Base de Dados.`,
          data.client_id, { action: 'generate_summary', jobId: pipelineResult.jobId, createdBy: 'jarvis' }
        );
      } catch {}

      return res.json({
        success: true,
        message: `Pipeline de ${data.client_name || 'cliente'} iniciado com sucesso.`,
        clientId: data.client_id,
        jobId: pipelineResult.jobId,
      });
    }

    /* ── SEND FORM (gera token + envia via WhatsApp) ──────── */
    if (action === 'send_form') {
      if (!data.client_id) return res.status(400).json({ success: false, error: 'client_id obrigatório' });
      if (!data.phone) return res.status(400).json({ success: false, error: 'Cliente não tem telefone cadastrado.' });

      // Formata telefone: garante DDI 55 (Brasil)
      let phone = String(data.phone).replace(/\D/g, '');
      if (!phone.startsWith('55')) phone = '55' + phone;
      data.phone = phone;

      // Gera token do formulario
      const { generateFormToken } = require('../../../models/clientForm');
      let tokenRow;
      try {
        tokenRow = await generateFormToken(tenantId, data.client_id);
      } catch (err) {
        console.error('[ERRO][Jarvis:Confirm] Falha ao gerar token', { error: err.message });
        return res.status(500).json({ success: false, error: 'Falha ao gerar o link do formulário.' });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
      const link = `${baseUrl}/form/${tokenRow.token}`;

      // Monta mensagem via template configurável (settings)
      const { getSetting } = require('../../../models/settings.model');
      const DEFAULT_FORM_MSG = `Olá! Segue o link do formulário de briefing da SIGMA Marketing:\n\n{LINK}\n\nPreencha com atenção — suas respostas serão usadas para gerar toda a estratégia de marketing.\n\nO link expira em 7 dias.`;
      const template = (await getSetting(tenantId, 'jarvis_msg_form_send')) || DEFAULT_FORM_MSG;
      const message = template
        .replace(/\{LINK\}/gi, link)
        .replace(/\{CLIENTE\}/gi, data.client_name || 'cliente');

      try {
        const { sendText } = require('../../../infra/api/zapi');
        const result = await sendText(data.phone, message, { delayTyping: 3 });
        console.log('[SUCESSO][Jarvis:Confirm] Formulário enviado via WhatsApp', {
          clientId: data.client_id, phone: data.phone, messageId: result?.messageId,
        });
        await logJarvisUsage(tenantId, user.id, 'confirm:send_form', JSON.stringify(data), `sent to ${data.phone}`, 0, true, null);

        try {
          await createNotification(
            tenantId, 'jarvis_action', 'Formulário enviado via JARVIS',
            `Link do formulário enviado para ${data.client_name || 'cliente'} (${data.phone}) via WhatsApp.`,
            data.client_id, { action: 'send_form', messageId: result?.messageId, createdBy: 'jarvis' }
          );
        } catch {}

        return res.json({
          success: true,
          message: `Formulário enviado para ${data.client_name || 'cliente'} via WhatsApp.`,
          link,
        });
      } catch (err) {
        console.error('[ERRO][Jarvis:Confirm] Falha ao enviar WhatsApp', { error: err.message });
        return res.status(500).json({
          success: false,
          error: `Não consegui enviar o formulário via WhatsApp. Verifique se o número ${data.phone} está correto e se a instância Z-API está conectada.`,
        });
      }
    }

    return res.status(400).json({ success: false, error: 'Ação desconhecida' });
  } catch (err) {
    console.error('[ERRO][API:/api/jarvis/confirm] Falha', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
