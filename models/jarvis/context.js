/**
 * models/jarvis/context.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Monta um snapshot compacto dos dados do sistema para injetar no prompt.
 * Cacheado por 120s para evitar queries repetidas a cada interacao.
 *
 * O objetivo e dar ao modelo informacao suficiente para responder 80%+ das
 * perguntas SEM function calling, reduzindo latencia e custo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');
const { getOrSet } = require('../../infra/cache');

function brl(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'R$ 0,00';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Busca e formata um snapshot compacto de todo o sistema do tenant.
 * Retorna uma string pronta para injetar no system prompt.
 * Cache de 120s.
 */
async function buildContextSnapshot(tenantId) {
  return getOrSet(`jarvis:ctx:${tenantId}`, async () => {
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Todas as queries em paralelo
    const [
      clientsRows,
      tasksOverdue,
      tasksToday,
      parcelasVencendo,
      parcelasAtrasadas,
      fatMes,
      aReceber,
      despMes,
      recMes,
      pipelineRunning,
      pipelines30,
      tokensMes,
      onboardings,
    ] = await Promise.all([
      // Clientes com resumo
      query(`
        SELECT mc.id, mc.company_name, mc.niche, mc.status, mc.form_done,
          (SELECT COUNT(*)::int FROM marketing_stages ms WHERE ms.client_id = mc.id AND ms.status = 'done') AS stages_done,
          (SELECT COUNT(*)::int FROM marketing_stages ms WHERE ms.client_id = mc.id) AS stages_total,
          (SELECT COALESCE(SUM(cc.monthly_value),0)::numeric FROM client_contracts cc WHERE cc.client_id = mc.id AND cc.status = 'active') AS monthly_value,
          (SELECT COUNT(*)::int FROM client_tasks ct WHERE ct.client_id = mc.id AND ct.done = false) AS open_tasks
        FROM marketing_clients mc
        WHERE mc.tenant_id = $1
        ORDER BY mc.company_name ASC
        LIMIT 50
      `, [tenantId]),

      // Tarefas atrasadas
      query(`
        SELECT ct.title, ct.due_date, ct.priority, mc.company_name
        FROM client_tasks ct
        LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
        WHERE mc.tenant_id = $1 AND ct.done = false
          AND ct.due_date IS NOT NULL AND ct.due_date < CURRENT_DATE
        ORDER BY ct.due_date ASC LIMIT 10
      `, [tenantId]),

      // Tarefas de hoje
      queryOne(`
        SELECT COUNT(*)::int AS c FROM client_tasks ct
        LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
        WHERE mc.tenant_id = $1 AND ct.done = false
          AND (ct.due_date IS NULL OR ct.due_date <= CURRENT_DATE)
      `, [tenantId]),

      // Parcelas vencendo proximos 7 dias
      query(`
        SELECT ci.due_date, ci.value, mc.company_name
        FROM client_installments ci
        JOIN marketing_clients mc ON mc.id = ci.client_id
        WHERE mc.tenant_id = $1 AND ci.status = 'pending'
          AND ci.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY ci.due_date ASC LIMIT 15
      `, [tenantId]),

      // Parcelas atrasadas
      query(`
        SELECT ci.due_date, ci.value, mc.company_name
        FROM client_installments ci
        JOIN marketing_clients mc ON mc.id = ci.client_id
        WHERE mc.tenant_id = $1 AND ci.status = 'pending' AND ci.due_date < CURRENT_DATE
        ORDER BY ci.due_date ASC LIMIT 10
      `, [tenantId]),

      // Faturamento do mes
      queryOne(`
        SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
        JOIN marketing_clients mc ON mc.id = ci.client_id
        WHERE mc.tenant_id = $1 AND ci.status = 'paid'
          AND date_trunc('month', COALESCE(ci.paid_at, ci.due_date)) = date_trunc('month', now())
      `, [tenantId]),

      // A receber total
      queryOne(`
        SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
        JOIN marketing_clients mc ON mc.id = ci.client_id
        WHERE mc.tenant_id = $1 AND ci.status = 'pending'
      `, [tenantId]),

      // Despesas do mes
      queryOne(`
        SELECT COALESCE(SUM(value),0)::numeric AS total FROM company_finances
        WHERE tenant_id = $1 AND type = 'expense'
          AND date_trunc('month', date) = date_trunc('month', now())
      `, [tenantId]),

      // Receitas do mes
      queryOne(`
        SELECT COALESCE(SUM(value),0)::numeric AS total FROM company_finances
        WHERE tenant_id = $1 AND type = 'income'
          AND date_trunc('month', date) = date_trunc('month', now())
      `, [tenantId]),

      // Pipeline rodando
      queryOne(`
        SELECT COUNT(*)::int AS c FROM pipeline_jobs
        WHERE tenant_id = $1 AND status = 'running'
      `, [tenantId]),

      // Pipelines ultimos 30 dias
      queryOne(`
        SELECT COUNT(*)::int AS c FROM pipeline_jobs
        WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '30 days'
      `, [tenantId]),

      // Tokens do mes
      queryOne(`
        SELECT COALESCE(SUM(tokens_total),0)::int AS total FROM ai_token_usage
        WHERE tenant_id = $1 AND date_trunc('month', created_at) = date_trunc('month', now())
      `, [tenantId]),

      // Onboardings pendentes
      query(`
        SELECT mc.company_name, mc.form_done
        FROM marketing_clients mc
        WHERE mc.tenant_id = $1 AND mc.form_done = false
        ORDER BY mc.company_name ASC LIMIT 10
      `, [tenantId]),
    ]);

    // Monta snapshot compacto
    const lines = [];
    lines.push(`── DADOS DO SISTEMA (${now}) ──`);
    lines.push('');

    // Clientes
    const activeCount = clientsRows.filter(c => c.status === 'active').length;
    lines.push(`CLIENTES (${clientsRows.length} total, ${activeCount} ativos):`);
    for (const c of clientsRows) {
      const pipeline = c.stages_total > 0 ? `pipeline: ${c.stages_done}/${c.stages_total}` : 'pipeline: nao iniciado';
      const monthly = Number(c.monthly_value) > 0 ? `${brl(c.monthly_value)}/mes` : 'sem contrato';
      const tasks = c.open_tasks > 0 ? `${c.open_tasks} tarefas` : '';
      const form = c.form_done ? 'form: ok' : 'form: pendente';
      const parts = [c.niche, monthly, pipeline, form, tasks].filter(Boolean);
      lines.push(`• ${c.company_name} — ${parts.join(', ')}`);
    }
    lines.push('');

    // Financeiro
    const totalAtrasadas = parcelasAtrasadas.reduce((s, r) => s + Number(r.value || 0), 0);
    const totalVencendo = parcelasVencendo.reduce((s, r) => s + Number(r.value || 0), 0);
    const liquido = Number(fatMes?.total || 0) + Number(recMes?.total || 0) - Number(despMes?.total || 0);
    lines.push('FINANCEIRO (mes atual):');
    lines.push(`• Faturado: ${brl(fatMes?.total)} | A receber: ${brl(aReceber?.total)} | Atrasado: ${brl(totalAtrasadas)} (${parcelasAtrasadas.length} parcelas)`);
    lines.push(`• Despesas: ${brl(despMes?.total)} | Receitas extras: ${brl(recMes?.total)} | Liquido: ${brl(liquido)}`);
    if (parcelasVencendo.length > 0) {
      lines.push(`• Vencendo nos proximos 7 dias: ${parcelasVencendo.length} parcelas (${brl(totalVencendo)})`);
      for (const p of parcelasVencendo.slice(0, 5)) {
        lines.push(`  - ${p.company_name}: ${brl(p.value)} em ${new Date(p.due_date).toLocaleDateString('pt-BR')}`);
      }
    }
    if (parcelasAtrasadas.length > 0) {
      lines.push(`• Em atraso:`);
      for (const p of parcelasAtrasadas.slice(0, 5)) {
        lines.push(`  - ${p.company_name}: ${brl(p.value)} venceu ${new Date(p.due_date).toLocaleDateString('pt-BR')}`);
      }
    }
    lines.push('');

    // Tarefas
    const overdueCount = tasksOverdue.length;
    const todayCount = tasksToday?.c || 0;
    lines.push(`TAREFAS: ${todayCount} abertas, ${overdueCount} atrasadas`);
    if (overdueCount > 0) {
      for (const t of tasksOverdue.slice(0, 5)) {
        lines.push(`• [ATRASADA] ${t.title}${t.company_name ? ` (${t.company_name})` : ''} — venceu ${new Date(t.due_date).toLocaleDateString('pt-BR')}`);
      }
    }
    lines.push('');

    // Pipeline & IA
    lines.push(`PIPELINE: ${pipelineRunning?.c || 0} rodando agora, ${pipelines30?.c || 0} nos ultimos 30 dias`);
    lines.push(`TOKENS IA (mes): ${(tokensMes?.total || 0).toLocaleString('pt-BR')}`);
    lines.push('');

    // Onboardings
    if (onboardings.length > 0) {
      lines.push(`ONBOARDINGS PENDENTES: ${onboardings.length}`);
      for (const o of onboardings) {
        lines.push(`• ${o.company_name} — formulario pendente`);
      }
    }

    return lines.join('\n');
  }, 120);
}

/**
 * Monta o bloco de memoria das ultimas interacoes do JARVIS.
 * Formato conversacional para que o modelo entenda o contexto.
 * Limitado a 3 interacoes (~200 tokens) para nao estourar.
 */
function formatMemory(recentUsage) {
  if (!recentUsage || recentUsage.length === 0) return '';

  const lines = [
    '── CONVERSA RECENTE (use para entender o contexto da pergunta atual) ──',
  ];
  // Inverte para ordem cronologica (mais antigo primeiro)
  const sorted = [...recentUsage].reverse();
  for (const u of sorted) {
    const time = new Date(u.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const cmd = u.command && u.command !== 'chat' && u.command !== 'error'
      ? ` (executou: ${u.command})` : '';
    const input = (u.input_text || '').slice(0, 60);
    const output = (u.response || '').slice(0, 100);
    lines.push(`[${time}] USUARIO: "${input}"`);
    lines.push(`[${time}] JARVIS${cmd}: "${output}"`);
  }
  lines.push('(Se o usuario disser "sim", "confirmo", "exato", "pode fazer" — ele esta confirmando a ultima acao acima.)');
  return lines.join('\n');
}

module.exports = { buildContextSnapshot, formatMemory };
