/**
 * models/comercial/messageTemplate.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD + bootstrap idempotente de templates de mensagem.
 * Variáveis: {nome_empresa}, {nome_contato}, {cidade}, {nicho},
 *            {link_proposta}, {nome_responsavel}
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

const DEFAULT_TEMPLATES = [
  {
    name: 'Cold — Primeiro contato',
    category: 'cold',
    channel: 'whatsapp',
    sort_order: 1,
    content:
`Oi {nome_contato}, aqui é {nome_responsavel} da SIGMA Marketing.

Vi que a {nome_empresa} tá em {cidade} no segmento de {nicho} — segui o trabalho de vocês e fiquei curioso pra entender melhor a estratégia digital atual.

Faz sentido marcarmos 20 minutos pra conversar essa semana? Posso te mostrar 3 oportunidades específicas que identifiquei.`,
  },
  {
    name: 'Follow-up 1 — 3 dias depois',
    category: 'followup1',
    channel: 'whatsapp',
    sort_order: 2,
    content:
`{nome_contato}, voltei aqui rapidinho.

Dei mais uma olhada na presença digital da {nome_empresa} e achei alguns gaps interessantes que dá pra resolver em 90 dias.

Bate uma agenda essa semana pra eu te apresentar?`,
  },
  {
    name: 'Follow-up 2 — 7 dias depois',
    category: 'followup2',
    channel: 'whatsapp',
    sort_order: 3,
    content:
`{nome_contato}, sei que tá corrido aí — só pra deixar o convite aberto.

Quando fizer sentido pra ti, me avisa que eu marco a conversa de 20 min.`,
  },
  {
    name: 'Envio de proposta',
    category: 'custom',
    channel: 'whatsapp',
    sort_order: 4,
    content:
`{nome_contato}, aqui está a proposta personalizada da SIGMA pra {nome_empresa}.

🔗 {link_proposta}

Esse link tem validade de 7 dias. Qualquer dúvida, me chama por aqui.`,
  },
  {
    name: 'Reativação — 30 dias depois',
    category: 'reactivation',
    channel: 'whatsapp',
    sort_order: 5,
    content:
`{nome_contato}, tudo bem por aí?

Faz um tempo que a gente conversou sobre marketing pra {nome_empresa}. Quis voltar pra checar se mudou alguma coisa do lado de vocês — às vezes o timing certo é só uns meses depois.

Posso te mandar um update rápido sobre o que estamos fazendo pra empresas parecidas em {cidade}?`,
  },
];

const VALID_CATEGORIES = ['cold', 'followup1', 'followup2', 'reactivation', 'custom'];
const VALID_CHANNELS   = ['whatsapp', 'email', 'call_script'];

/**
 * Cria os templates default se ainda não existirem para esse tenant.
 * Idempotente.
 */
async function bootstrapDefaultTemplates(tenantId) {
  const existing = await queryOne(
    `SELECT COUNT(*)::int AS c FROM comercial_message_templates WHERE tenant_id = $1`,
    [tenantId]
  );
  if (existing && existing.c > 0) return false;

  console.log('[INFO][model:msgTemplate:bootstrap]', { tenantId });
  for (const t of DEFAULT_TEMPLATES) {
    await query(
      `INSERT INTO comercial_message_templates
         (tenant_id, name, category, channel, content, is_default, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, true, $6, true)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenantId, t.name, t.category, t.channel, t.content, t.sort_order]
    );
  }
  return true;
}

async function listTemplates(tenantId, { category, channel, active = true } = {}) {
  const conditions = ['tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;
  if (active !== null) { conditions.push(`active = $${idx++}`); params.push(active); }
  if (category)        { conditions.push(`category = $${idx++}`); params.push(category); }
  if (channel)         { conditions.push(`channel = $${idx++}`);  params.push(channel); }

  return query(
    `SELECT * FROM comercial_message_templates
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, name ASC`,
    params
  );
}

async function getTemplateById(id, tenantId) {
  return queryOne(
    `SELECT * FROM comercial_message_templates WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createTemplate(tenantId, data, createdBy = null) {
  const cat = VALID_CATEGORIES.includes(data.category) ? data.category : 'custom';
  const ch  = VALID_CHANNELS.includes(data.channel)    ? data.channel  : 'whatsapp';
  return queryOne(
    `INSERT INTO comercial_message_templates
       (tenant_id, name, category, channel, content, sort_order, active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId, data.name, cat, ch, data.content,
      data.sort_order || 999,
      data.active !== false,
      createdBy,
    ]
  );
}

const EDITABLE_FIELDS = ['name', 'category', 'channel', 'content', 'sort_order', 'active'];

async function updateTemplate(id, tenantId, data) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const f of EDITABLE_FIELDS) {
    if (data[f] === undefined) continue;
    sets.push(`${f} = $${idx++}`);
    params.push(data[f]);
  }
  if (sets.length === 0) return getTemplateById(id, tenantId);
  params.push(id, tenantId);
  return queryOne(
    `UPDATE comercial_message_templates SET ${sets.join(', ')}
      WHERE id = $${idx++} AND tenant_id = $${idx}
      RETURNING *`,
    params
  );
}

async function deleteTemplate(id, tenantId) {
  await query(
    `DELETE FROM comercial_message_templates WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Substitui {variavel} por valores. Variáveis ausentes ficam como `{variavel}`.
 */
function renderTemplate(content, vars = {}) {
  if (!content) return '';
  return String(content).replace(/\{(\w+)\}/g, (m, key) =>
    vars[key] != null && vars[key] !== '' ? String(vars[key]) : m
  );
}

module.exports = {
  bootstrapDefaultTemplates,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  renderTemplate,
  DEFAULT_TEMPLATES,
  VALID_CATEGORIES,
  VALID_CHANNELS,
};
