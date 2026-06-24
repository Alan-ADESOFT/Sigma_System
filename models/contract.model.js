/**
 * models/contract.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Criação de contrato (client_contracts) + geração automática de parcelas
 * (client_installments). Compartilhado entre o fechamento de lead (won.js) e
 * qualquer outro fluxo que precise criar contrato já com parcelas.
 *
 * NB: client_contracts NÃO tem coluna tenant_id — o isolamento é via
 * client_id → marketing_clients.tenant_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { query, queryOne } = require('../infra/db');

/* Normaliza services (string | objeto {id,name} | string JSON | com nulls)
   → array de nomes únicos. Evita persistir null no JSONB. */
function sanitizeServices(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr || '[]'); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  const names = arr
    .map(s => (typeof s === 'string' ? s : (s && typeof s === 'object' ? s.name : null)))
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => s.trim());
  return [...new Set(names)];
}

function buildInstallments(contractId, clientId, monthlyValue, numInstallments, dueDay, startDate) {
  // Aritmética de data PURA (componentes ano/mês/dia) — sem objetos Date com
  // string ISO, que seriam interpretados em UTC e, com setMonth/setDate em
  // horário local (ex: UTC-3), deslocariam as parcelas em 1 dia. Também trata
  // overflow de mês (ex: dia 31 em fevereiro → último dia do mês).
  const [sy, sm, sd] = String(startDate).split('T')[0].split('-').map(Number);
  const installments = [];
  for (let i = 0; i < numInstallments; i++) {
    let y, m, day;
    if (i === 0) {
      // 1ª parcela na data exata de início (permite dia diferente do recorrente)
      y = sy; m = sm; day = sd;
    } else {
      const totalMonth = (sm - 1) + i;          // mês 0-indexado acumulado
      y = sy + Math.floor(totalMonth / 12);
      m = (totalMonth % 12) + 1;                 // volta pra 1-indexado
      const lastDay = new Date(y, m, 0).getDate(); // último dia do mês m
      day = Math.min(dueDay, lastDay);
    }
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    installments.push({ contractId, clientId, num: i + 1, dueDate: iso, value: monthlyValue });
  }
  return installments;
}

/**
 * Cria um contrato e gera todas as parcelas. Retorna { ...contract, installments }.
 * @param {string} clientId
 * @param {object} opts { monthly_value, num_installments, due_day, start_date, services, notes, status }
 */
async function createContractWithInstallments(clientId, opts = {}) {
  const mv = parseFloat(opts.monthly_value) || 0;
  const ni = parseInt(opts.num_installments) || 12;
  const totalValue = mv * ni;
  const day = Math.min(Math.max(parseInt(opts.due_day) || 10, 1), 31);
  const startDate = opts.start_date || new Date().toISOString().split('T')[0];

  const contract = await queryOne(
    `INSERT INTO client_contracts
       (client_id, contract_value, monthly_value, num_installments, frequency, period_months, due_day, start_date, services, notes, status)
     VALUES ($1, $2, $3, $4, 'monthly', $4, $5, $6, $7, $8, $9) RETURNING *`,
    [clientId, totalValue, mv, ni, day, startDate, JSON.stringify(sanitizeServices(opts.services)), opts.notes || null, opts.status || 'active']
  );

  const rows = buildInstallments(contract.id, clientId, mv, ni, day, startDate);
  for (const r of rows) {
    await queryOne(
      `INSERT INTO client_installments (contract_id, client_id, installment_number, due_date, value)
       VALUES ($1, $2, $3, $4, $5)`,
      [r.contractId, r.clientId, r.num, r.dueDate, r.value]
    );
  }

  const installments = await query(
    `SELECT * FROM client_installments WHERE contract_id = $1 ORDER BY installment_number ASC`,
    [contract.id]
  );
  return { ...contract, installments };
}

module.exports = { sanitizeServices, buildInstallments, createContractWithInstallments };
