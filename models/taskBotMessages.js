/**
 * models/taskBotMessages.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve a mensagem do bot de tarefas com fallback em camadas:
 *   1. Configuração individual do usuário (task_bot_config.message_*)
 *   2. Template global do tenant (settings.task_bot_template_*)
 *   3. Default hardcoded
 *
 * E renderiza variáveis: {nome}, {tarefas}, {reunioes}, {count}.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { queryOne } = require('../infra/db');

const HARDCODED_MORNING = `🌅 *Bom dia, {nome}!*

📋 *Suas tarefas de hoje:*
{tarefas}

📅 *Reuniões agendadas:*
{reunioes}

Bora começar! 💪`;

const HARDCODED_OVERDUE = `⚠️ *Atenção, {nome}*

Você tem *{count} tarefa(s) atrasada(s)*:

{tarefas}

Resolva ainda hoje para manter o ritmo. 🎯`;

/**
 * Lê o template global salvo na tabela settings para o tenant.
 * Retorna null se não existir.
 */
async function getGlobalTemplate(tenantId, key) {
  try {
    const row = await queryOne(
      `SELECT value FROM settings WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key]
    );
    return row ? row.value : null;
  } catch {
    return null;
  }
}

/**
 * Resolve qual template usar para o usuário no tipo solicitado.
 *
 * @param {object} cfg - Linha de task_bot_config (com message_morning/message_overdue)
 * @param {string} tenantId
 * @param {'morning'|'overdue'} kind
 * @returns {Promise<string>}
 */
async function resolveTemplate(cfg, tenantId, kind) {
  const userField = kind === 'morning' ? 'message_morning' : 'message_overdue';
  const userMsg = cfg && cfg[userField] ? String(cfg[userField]).trim() : '';
  if (userMsg) return userMsg;

  const globalKey = kind === 'morning' ? 'task_bot_template_morning' : 'task_bot_template_overdue';
  const globalMsg = await getGlobalTemplate(tenantId, globalKey);
  if (globalMsg) return globalMsg;

  return kind === 'morning' ? HARDCODED_MORNING : HARDCODED_OVERDUE;
}

/**
 * Substitui as variáveis {chave} pelos valores fornecidos.
 * Variáveis ausentes são preservadas no template.
 */
function renderTemplate(template, vars) {
  let out = template || '';
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), value == null ? '' : String(value));
  }
  return out;
}

/**
 * Helper: lista de tarefas formatada como bullet points com emoji de prioridade.
 * Aceita tasks no formato { title, priority, category_name }.
 */
function formatTaskList(tasks) {
  if (!tasks || tasks.length === 0) return '_(nenhuma)_';
  const priorityEmoji = { urgente: '🔴', alta: '🟠', normal: '🔵', baixa: '⚪' };
  return tasks
    .map((t) => {
      const cat = t.category_name ? ` — _${t.category_name}_` : '';
      const pe = priorityEmoji[t.priority] || '🔵';
      return `${pe} *${t.title}*${cat}`;
    })
    .join('\n');
}

/**
 * Helper: lista de reuniões formatada.
 * Aceita meetings no formato { title, start_time, client_name }.
 */
function formatMeetingList(meetings) {
  if (!meetings || meetings.length === 0) return '_(nenhuma)_';
  return meetings
    .map((m) => {
      const time = m.start_time ? String(m.start_time).slice(0, 5) : '';
      const client = m.client_name ? ` com *${m.client_name}*` : '';
      return `• *${m.title}* às *${time}*${client}`;
    })
    .join('\n');
}

module.exports = {
  resolveTemplate,
  renderTemplate,
  formatTaskList,
  formatMeetingList,
  HARDCODED_MORNING,
  HARDCODED_OVERDUE,
};
