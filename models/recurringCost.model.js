/**
 * models/recurringCost.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Custos fixos recorrentes. Cadastra-se uma vez; o sistema lança a despesa
 * correspondente em `company_finances` a cada mês — o usuário não precisa
 * re-cadastrar os fixos todo mês.
 *
 * Geração idempotente por mês: `last_generated_month` guarda 'YYYY-MM' do último
 * lançamento. Disparada via ensure-on-read (GET /api/financeiro/company) e/ou
 * cron `/api/cron/recurring-costs`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

async function getRecurringCosts(tenantId) {
  return query(
    `SELECT rc.*, fc.name AS category_name, fc.color AS category_color
       FROM recurring_costs rc
       LEFT JOIN finance_categories fc ON fc.id = rc.category_id
      WHERE rc.tenant_id = $1
      ORDER BY rc.is_active DESC, rc.description ASC`,
    [tenantId]
  );
}

async function getById(id, tenantId) {
  return queryOne(
    `SELECT * FROM recurring_costs WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

async function createRecurringCost(tenantId, { description, value, category_id, day_of_month, frequency, notes }) {
  return queryOne(
    `INSERT INTO recurring_costs (tenant_id, description, value, category_id, day_of_month, frequency, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      description,
      value,
      category_id || null,
      Number(day_of_month) || 1,
      frequency || 'monthly',
      notes || null,
    ]
  );
}

async function updateRecurringCost(id, tenantId, p) {
  // category_id é "limpável": se a chave veio no payload (mesmo null), aplica;
  // se não veio (ex.: toggle de is_active), preserva. Sem isso, COALESCE
  // impediria voltar pra "Sem categoria".
  const catProvided = p.category_id !== undefined;
  return queryOne(
    `UPDATE recurring_costs SET
       description  = COALESCE($3, description),
       value        = COALESCE($4, value),
       category_id  = CASE WHEN $5::boolean THEN $6 ELSE category_id END,
       day_of_month = COALESCE($7, day_of_month),
       frequency    = COALESCE($8, frequency),
       is_active    = COALESCE($9, is_active),
       notes        = COALESCE($10, notes),
       updated_at   = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      id, tenantId,
      p.description ?? null,
      p.value != null ? Number(p.value) : null,
      catProvided,
      catProvided ? (p.category_id || null) : null,
      p.day_of_month != null ? Number(p.day_of_month) : null,
      p.frequency ?? null,
      p.is_active != null ? Boolean(p.is_active) : null,
      p.notes ?? null,
    ]
  );
}

async function deleteRecurringCost(id, tenantId) {
  return queryOne(
    `DELETE FROM recurring_costs WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId]
  );
}

/** Custos ativos ainda não lançados no mês `monthKey` ('YYYY-MM'). */
async function getDueForMonth(tenantId, monthKey) {
  return query(
    `SELECT * FROM recurring_costs
      WHERE tenant_id = $1
        AND is_active = true
        AND (last_generated_month IS DISTINCT FROM $2)`,
    [tenantId, monthKey]
  );
}

async function markGenerated(id, tenantId, monthKey) {
  return query(
    `UPDATE recurring_costs SET last_generated_month = $3, updated_at = now()
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, monthKey]
  );
}

function todayBRT() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
}

/**
 * Lança em `company_finances` (type=expense) todos os custos recorrentes do mês
 * `monthKey` ('YYYY-MM') ainda não gerados. Idempotente — marca cada custo com
 * `last_generated_month`. Só lança quando o dia do mês já chegou (para o mês
 * corrente), evitando despesas com data futura. Retorna a quantidade lançada.
 */
async function generateForMonth(tenantId, monthKey) {
  const due = await getDueForMonth(tenantId, monthKey);
  if (!due.length) return 0;

  const [yy, mm] = monthKey.split('-').map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  const today = todayBRT();
  const curMonth = today.slice(0, 7);
  const curDay = parseInt(today.slice(8, 10), 10);

  let created = 0;
  for (const rc of due) {
    const dom = Math.min(Math.max(parseInt(rc.day_of_month, 10) || 1, 1), lastDay);
    // No mês corrente, só lança quando o dia já chegou. Meses passados lançam já.
    if (monthKey === curMonth && curDay < dom) continue;

    // Claim atômico do mês: o UPDATE só "ganha" uma vez (last_generated_month
    // IS DISTINCT FROM monthKey). Evita lançamento duplicado quando dois GETs
    // (duas abas / effect duplo do React) disparam o ensure-on-read juntos.
    const claimed = await queryOne(
      `UPDATE recurring_costs
          SET last_generated_month = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND (last_generated_month IS DISTINCT FROM $3)
        RETURNING id`,
      [rc.id, tenantId, monthKey]
    );
    if (!claimed) continue; // outra execução já lançou este mês

    const dateStr = `${monthKey}-${String(dom).padStart(2, '0')}`;

    let catName = null;
    if (rc.category_id) {
      const c = await queryOne(
        `SELECT name FROM finance_categories WHERE id = $1 AND tenant_id = $2`,
        [rc.category_id, tenantId]
      );
      catName = c?.name || null;
    }

    await query(
      `INSERT INTO company_finances (tenant_id, type, category, category_id, description, value, date, notes)
       VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7)`,
      [tenantId, catName, rc.category_id || null, rc.description, rc.value, dateStr, rc.notes || 'Custo recorrente (automático)']
    );
    created++;
  }
  return created;
}

module.exports = {
  getRecurringCosts,
  getById,
  createRecurringCost,
  updateRecurringCost,
  deleteRecurringCost,
  getDueForMonth,
  markGenerated,
  generateForMonth,
};
