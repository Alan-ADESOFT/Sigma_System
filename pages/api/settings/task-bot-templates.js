/**
 * pages/api/settings/task-bot-templates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET / POST templates globais de mensagens do bot de tarefas.
 * Usa a tabela `settings` (key/value) por tenant — chaves:
 *   - task_bot_template_morning
 *   - task_bot_template_overdue
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { query, queryOne } = require('../../../infra/db');

const KEY_MORNING = 'task_bot_template_morning';
const KEY_OVERDUE = 'task_bot_template_overdue';

const DEFAULT_MORNING = `🌅 *Bom dia, {nome}!*

Aqui está o seu dia organizado:

📋 *Suas tarefas de hoje:*
{tarefas}

📅 *Reuniões agendadas:*
{reunioes}

Vamos com tudo! 💪`;

const DEFAULT_OVERDUE = `⚠️ *Atenção, {nome}*

Você tem *{count} tarefa(s) atrasada(s)* aguardando ação:

{tarefas}

Resolva ainda hoje para manter o ritmo. 🎯`;

async function getSetting(tenantId, key) {
  const row = await queryOne(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = $2`,
    [tenantId, key]
  );
  return row ? row.value : null;
}

async function setSetting(tenantId, key, value) {
  await query(
    `INSERT INTO settings (tenant_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [tenantId, key, value]
  );
}

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const morning = (await getSetting(tenantId, KEY_MORNING)) || DEFAULT_MORNING;
      const overdue = (await getSetting(tenantId, KEY_OVERDUE)) || DEFAULT_OVERDUE;
      return res.json({
        success: true,
        templates: { morning, overdue },
        defaults: { morning: DEFAULT_MORNING, overdue: DEFAULT_OVERDUE },
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { morning, overdue } = req.body || {};
      if (typeof morning === 'string') {
        await setSetting(tenantId, KEY_MORNING, morning);
      }
      if (typeof overdue === 'string') {
        await setSetting(tenantId, KEY_OVERDUE, overdue);
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/settings/task-bot-templates]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
