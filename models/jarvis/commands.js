/**
 * @fileoverview models/jarvis/commands.js
 * Implementação das 13 funções (tools) do Jarvis + dispatcher.
 *
 * Cada função recebe (params, tenantId, userId, userRole) e retorna um objeto
 * com `summary` (texto curto para o usuário) e `data` (estruturado).
 *
 * Funções de criação (criar_tarefa, registrar_receita, registrar_despesa,
 * gerar_resumo) NÃO persistem — devolvem `requiresConfirmation: true` e o
 * preview que será confirmado pelo frontend via /api/jarvis/confirm.
 */

const { query, queryOne } = require('../../infra/db');

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function brl(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'R$ 0,00';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Tenta interpretar uma data PT-BR informal vinda da IA.
 * Aceita: 'YYYY-MM-DD', 'hoje', 'amanha', 'ontem', 'sexta', 'sabado', etc.
 */
function parseLooseDate(input) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim();
  // Já é ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (s === 'hoje' || s === 'today') return today.toISOString().slice(0, 10);
  if (s === 'amanha' || s === 'amanhã' || s === 'tomorrow') {
    const t = new Date(today); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10);
  }
  if (s === 'ontem' || s === 'yesterday') {
    const t = new Date(today); t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10);
  }

  // Dias da semana
  const dows = { 'domingo':0,'segunda':1,'terca':2,'terça':2,'quarta':3,'quinta':4,'sexta':5,'sabado':6,'sábado':6 };
  const dow = Object.keys(dows).find(k => s.includes(k));
  if (dow !== undefined) {
    const target = dows[dow];
    const cur = today.getDay();
    let delta = target - cur;
    if (delta <= 0) delta += 7;
    const t = new Date(today); t.setDate(t.getDate() + delta); return t.toISOString().slice(0, 10);
  }

  return null;
}

async function findClientByName(tenantId, nameLike) {
  if (!nameLike) return null;
  return queryOne(
    `SELECT id, company_name, niche, status, form_done
     FROM marketing_clients
     WHERE tenant_id = $1 AND LOWER(company_name) LIKE LOWER($2)
     ORDER BY company_name ASC
     LIMIT 1`,
    [tenantId, `%${nameLike}%`]
  );
}

async function findUserByName(tenantId, nameLike) {
  if (!nameLike) return null;
  return queryOne(
    `SELECT id, name, role
     FROM tenants
     WHERE id = $1 OR LOWER(name) LIKE LOWER($2)
     ORDER BY (id = $1) DESC, name ASC
     LIMIT 1`,
    [tenantId, `%${nameLike}%`]
  );
}

/* ═════════════════════════════════════════════════════════════════════════
   GRUPO 1 — CLIENTES
═════════════════════════════════════════════════════════════════════════ */

async function cmdBuscarCliente(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:BuscarCliente]', { tenantId, params });

  const client = await findClientByName(tenantId, params?.nome);
  if (!client) {
    return {
      summary: `Não encontrei nenhum cliente com nome contendo "${params?.nome || '(vazio)'}".`,
      data: null,
    };
  }

  // Contratos ativos
  const contracts = await query(
    `SELECT id, contract_value, monthly_value, status, start_date
     FROM client_contracts WHERE client_id = $1 AND status = 'active'
     ORDER BY start_date DESC`,
    [client.id]
  );
  // Parcelas em aberto
  const installments = await query(
    `SELECT COUNT(*)::int AS pendentes,
            COALESCE(SUM(value),0)::numeric AS total
     FROM client_installments WHERE client_id = $1 AND status = 'pending'`,
    [client.id]
  );
  // Tarefas abertas
  const tasks = await query(
    `SELECT COUNT(*)::int AS abertas FROM client_tasks
     WHERE client_id = $1 AND done = false`,
    [client.id]
  );

  const monthly = contracts.reduce((s, c) => s + Number(c.monthly_value || 0), 0);
  const inst    = installments?.[0] || { pendentes: 0, total: 0 };
  const t       = tasks?.[0] || { abertas: 0 };

  console.log('[SUCESSO][Jarvis:BuscarCliente] resumo montado', { clientId: client.id });

  return {
    summary: `${client.company_name}: ${contracts.length} contrato(s) ativo(s), ${brl(monthly)}/mês. ${inst.pendentes} parcela(s) pendente(s) totalizando ${brl(inst.total)}. ${t.abertas} tarefa(s) aberta(s).`,
    data: { client, contracts, installments: inst, tasks: t },
  };
}

async function cmdCriarTarefa(params, tenantId, userId) {
  console.log('[INFO][Jarvis:CriarTarefa]', { tenantId, userId, params });

  const title = (params?.title || '').trim();
  if (!title) return { summary: 'Não consegui identificar o título da tarefa.', data: null };

  const description = params?.description || null;
  const priority    = ['baixa','normal','alta','urgente'].includes(params?.priority) ? params.priority : 'normal';
  const due_date    = parseLooseDate(params?.due_date);

  let client = null;
  if (params?.client_name) client = await findClientByName(tenantId, params.client_name);

  let assigned = null;
  if (params?.assigned_to_name) assigned = await findUserByName(tenantId, params.assigned_to_name);
  if (!assigned) assigned = await queryOne(`SELECT id, name FROM tenants WHERE id = $1`, [userId]);

  const preview = {
    title,
    description,
    priority,
    due_date,
    client_id:    client?.id || null,
    client_name:  client?.company_name || null,
    assigned_to:      assigned?.id || userId,
    assigned_to_name: assigned?.name || null,
    created_by: userId,
    tenant_id:  tenantId,
  };

  console.log('[SUCESSO][Jarvis:CriarTarefa] preview montado', { preview });

  return {
    summary: `Tarefa "${title}" pronta para criação${client ? ` para ${client.company_name}` : ''}${assigned ? `, atribuída a ${assigned.name}` : ''}.`,
    data: preview,
    requiresConfirmation: true,
    confirmAction: 'create_task',
  };
}

async function cmdTarefasAtrasadas(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:TarefasAtrasadas]', { tenantId });

  const rows = await query(
    `SELECT ct.id, ct.title, ct.priority, ct.due_date, ct.client_id,
            mc.company_name
     FROM client_tasks ct
     LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
     WHERE mc.tenant_id = $1 AND ct.done = false AND ct.due_date IS NOT NULL
       AND ct.due_date < CURRENT_DATE
     ORDER BY ct.due_date ASC
     LIMIT 30`,
    [tenantId]
  );

  if (!rows.length) return { summary: 'Não há tarefas atrasadas.', data: [] };

  const top = rows.slice(0, 5).map(r => `· ${r.title}${r.company_name ? ` (${r.company_name})` : ''}`).join('\n');
  return {
    summary: `${rows.length} tarefa(s) atrasada(s). Mais antigas:\n${top}`,
    data: rows,
  };
}

async function cmdResumoDoDia(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:ResumoDoDia]', { tenantId });

  const tarefasHoje = await queryOne(
    `SELECT COUNT(*)::int AS c FROM client_tasks ct
     LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
     WHERE mc.tenant_id = $1 AND ct.done = false
       AND (ct.due_date IS NULL OR ct.due_date <= CURRENT_DATE)`,
    [tenantId]
  );
  const parcelas7 = await queryOne(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(value),0)::numeric AS total
     FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'pending'
       AND ci.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
    [tenantId]
  );
  const onboardingsTravados = await queryOne(
    `SELECT COUNT(*)::int AS c FROM marketing_clients
     WHERE tenant_id = $1 AND form_done = false`,
    [tenantId]
  );

  const t = tarefasHoje?.c || 0;
  const p = parcelas7?.c || 0;
  const o = onboardingsTravados?.c || 0;

  return {
    summary: `Hoje: ${t} tarefa(s) abertas, ${p} parcela(s) vencendo nos próximos 7 dias (${brl(parcelas7?.total)}), ${o} onboarding(s) pendente(s).`,
    data: { tarefas: t, parcelas: parcelas7, onboardings: o },
  };
}

async function cmdTarefasDeOutroUsuario(params, tenantId, userId, userRole) {
  console.log('[INFO][Jarvis:TarefasUsuario]', { tenantId, userRole, params });

  if ((userRole || 'user').toLowerCase() !== 'admin') {
    return { summary: 'Apenas administradores podem ver tarefas de outros usuários.', data: null };
  }

  const target = await findUserByName(tenantId, params?.user_name);
  if (!target) return { summary: `Usuário "${params?.user_name}" não encontrado neste workspace.`, data: null };

  const rows = await query(
    `SELECT ct.id, ct.title, ct.priority, ct.due_date, ct.done, mc.company_name
     FROM client_tasks ct
     LEFT JOIN marketing_clients mc ON mc.id = ct.client_id
     WHERE mc.tenant_id = $1 AND ct.assigned_to = $2 AND ct.done = false
     ORDER BY ct.due_date ASC NULLS LAST
     LIMIT 30`,
    [tenantId, target.id]
  );

  return {
    summary: `${target.name}: ${rows.length} tarefa(s) aberta(s).`,
    data: { user: target, tasks: rows },
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   GRUPO 2 — FINANCEIRO
═════════════════════════════════════════════════════════════════════════ */

async function cmdParcelasVencendo(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:ParcelasVencendo]', { tenantId, params });

  const dias = Math.max(1, Math.min(60, parseInt(params?.dias, 10) || 7));

  const futuras = await query(
    `SELECT ci.id, ci.due_date, ci.value, ci.installment_number, mc.company_name
     FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'pending'
       AND ci.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval
     ORDER BY ci.due_date ASC`,
    [tenantId, String(dias)]
  );

  const atrasadas = await query(
    `SELECT ci.id, ci.due_date, ci.value, mc.company_name
     FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'pending' AND ci.due_date < CURRENT_DATE
     ORDER BY ci.due_date ASC`,
    [tenantId]
  );

  const totalFut = futuras.reduce((s, r) => s + Number(r.value || 0), 0);
  const totalAtr = atrasadas.reduce((s, r) => s + Number(r.value || 0), 0);

  return {
    summary: `${futuras.length} parcela(s) nos próximos ${dias} dias (${brl(totalFut)}). ${atrasadas.length} em atraso (${brl(totalAtr)}).`,
    data: { futuras, atrasadas, totalFuturas: totalFut, totalAtrasadas: totalAtr },
  };
}

async function cmdResumoFinanceiro(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:ResumoFinanceiro]', { tenantId });

  const fatMes = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'paid'
       AND date_trunc('month', COALESCE(ci.paid_at, ci.due_date)) = date_trunc('month', now())`,
    [tenantId]
  );
  const aReceber = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'pending'`,
    [tenantId]
  );
  const atraso = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'pending' AND ci.due_date < CURRENT_DATE`,
    [tenantId]
  );
  const despMes = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM company_finances
     WHERE tenant_id = $1 AND type = 'expense'
       AND date_trunc('month', date) = date_trunc('month', now())`,
    [tenantId]
  );
  const recMes = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM company_finances
     WHERE tenant_id = $1 AND type = 'income'
       AND date_trunc('month', date) = date_trunc('month', now())`,
    [tenantId]
  );

  const liq = Number(fatMes?.total || 0) + Number(recMes?.total || 0) - Number(despMes?.total || 0);

  return {
    summary: `Faturamento do mês: ${brl(fatMes?.total)}. A receber: ${brl(aReceber?.total)} (${brl(atraso?.total)} em atraso). Despesas: ${brl(despMes?.total)}. Líquido: ${brl(liq)}.`,
    data: {
      faturamento_mes: fatMes?.total,
      a_receber: aReceber?.total,
      em_atraso: atraso?.total,
      despesas_mes: despMes?.total,
      receitas_mes: recMes?.total,
      liquido: liq,
    },
  };
}

async function cmdRegistrarReceita(params, tenantId, userId) {
  console.log('[INFO][Jarvis:RegistrarReceita]', { tenantId, userId, params });

  const value = Number(params?.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { summary: 'Valor inválido para receita.', data: null };
  }
  const description = (params?.description || '').trim();
  if (!description) return { summary: 'Descrição da receita é obrigatória.', data: null };

  const date = parseLooseDate(params?.date) || new Date().toISOString().slice(0, 10);

  const preview = {
    type: 'income',
    description,
    value,
    category: params?.category || null,
    date,
    tenant_id: tenantId,
  };

  return {
    summary: `Receita pronta: ${description} — ${brl(value)} em ${date}.`,
    data: preview,
    requiresConfirmation: true,
    confirmAction: 'save_income',
  };
}

async function cmdRegistrarDespesa(params, tenantId, userId) {
  console.log('[INFO][Jarvis:RegistrarDespesa]', { tenantId, userId, params });

  const value = Number(params?.value);
  if (!Number.isFinite(value) || value <= 0) {
    return { summary: 'Valor inválido para despesa.', data: null };
  }
  const description = (params?.description || '').trim();
  if (!description) return { summary: 'Descrição da despesa é obrigatória.', data: null };

  const date = parseLooseDate(params?.date) || new Date().toISOString().slice(0, 10);

  const preview = {
    type: 'expense',
    description,
    value,
    category: params?.category || null,
    date,
    tenant_id: tenantId,
  };

  return {
    summary: `Despesa pronta: ${description} — ${brl(value)} em ${date}.`,
    data: preview,
    requiresConfirmation: true,
    confirmAction: 'save_expense',
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   GRUPO 3 — PIPELINE & IA
═════════════════════════════════════════════════════════════════════════ */

async function cmdStatusPipeline(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:StatusPipeline]', { tenantId, params });

  const client = await findClientByName(tenantId, params?.nome);
  if (!client) return { summary: `Cliente "${params?.nome}" não encontrado.`, data: null };

  const stages = await query(
    `SELECT stage_key, status, updated_at FROM marketing_stages
     WHERE client_id = $1 ORDER BY stage_key ASC`,
    [client.id]
  );

  const done = stages.filter(s => s.status === 'done').length;
  const list = stages.map(s => `· ${s.stage_key}: ${s.status}`).join('\n');

  return {
    summary: `${client.company_name}: ${done}/${stages.length} etapas concluídas.\n${list}`,
    data: { client, stages },
  };
}

async function cmdGerarResumoCliente(params, tenantId, userId) {
  console.log('[INFO][Jarvis:GerarResumo]', { tenantId, userId, params });

  const nome = (params?.nome || '').trim();

  // Bloqueia "rodar para todos" — exige cliente especifico
  if (!nome || /\btodos\b|\btodas\b|\bgeral\b/i.test(nome)) {
    return {
      summary: 'Não é permitido rodar o pipeline para todos os clientes de uma vez. Por segurança, selecione um cliente específico. Por exemplo: "roda o pipeline do cliente FlowTech".',
      data: null,
    };
  }

  const client = await findClientByName(tenantId, nome);
  if (!client) return { summary: `Não encontrei nenhum cliente com o nome "${nome}". Verifique o nome e tente novamente.`, data: null };

  // Valida se o formulário foi preenchido
  if (!client.form_done) {
    return {
      summary: `Não é possível rodar o pipeline de ${client.company_name} porque o formulário de briefing ainda não foi preenchido. Envie o formulário primeiro usando "enviar formulário para ${client.company_name}".`,
      data: null,
    };
  }

  // Verifica se já tem pipeline rodando
  const running = await queryOne(
    `SELECT id FROM pipeline_jobs WHERE client_id = $1 AND status = 'running' LIMIT 1`,
    [client.id]
  );
  if (running) {
    return {
      summary: `Já existe um pipeline em andamento para ${client.company_name}. Aguarde a conclusão antes de iniciar outro.`,
      data: null,
    };
  }

  const preview = { client_id: client.id, client_name: client.company_name };

  return {
    summary: `Pipeline de ${client.company_name} pronto para ser iniciado. Isso vai gerar os rascunhos estratégicos de diagnóstico, concorrentes, público-alvo, avatar e posicionamento. Confirme para iniciar.`,
    data: preview,
    requiresConfirmation: true,
    confirmAction: 'generate_summary',
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   GRUPO 4 — DASHBOARD
═════════════════════════════════════════════════════════════════════════ */

async function cmdMetricasGerais(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:MetricasGerais]', { tenantId });

  const clientes = await queryOne(
    `SELECT COUNT(*)::int AS c FROM marketing_clients
     WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );
  const pipelines30 = await queryOne(
    `SELECT COUNT(*)::int AS c FROM pipeline_jobs
     WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '30 days'`,
    [tenantId]
  );
  const tokensMes = await queryOne(
    `SELECT COALESCE(SUM(tokens_total),0)::int AS total FROM ai_token_usage
     WHERE tenant_id = $1 AND date_trunc('month', created_at) = date_trunc('month', now())`,
    [tenantId]
  );
  const fatMes = await queryOne(
    `SELECT COALESCE(SUM(value),0)::numeric AS total FROM client_installments ci
     JOIN marketing_clients mc ON mc.id = ci.client_id
     WHERE mc.tenant_id = $1 AND ci.status = 'paid'
       AND date_trunc('month', COALESCE(ci.paid_at, ci.due_date)) = date_trunc('month', now())`,
    [tenantId]
  );

  return {
    summary: `${clientes?.c || 0} cliente(s) ativos, ${pipelines30?.c || 0} pipeline(s) nos últimos 30 dias, ${(tokensMes?.total || 0).toLocaleString('pt-BR')} tokens neste mês, faturamento ${brl(fatMes?.total)}.`,
    data: { clientes: clientes?.c, pipelines30: pipelines30?.c, tokensMes: tokensMes?.total, faturamentoMes: fatMes?.total },
  };
}

async function cmdClientesSemPipeline(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:ClientesSemPipeline]', { tenantId });

  const rows = await query(
    `SELECT mc.id, mc.company_name
     FROM marketing_clients mc
     WHERE mc.tenant_id = $1 AND mc.form_done = true
       AND NOT EXISTS (SELECT 1 FROM pipeline_jobs pj WHERE pj.client_id = mc.id AND pj.status = 'done')
     ORDER BY mc.company_name ASC
     LIMIT 30`,
    [tenantId]
  );

  if (!rows.length) return { summary: 'Todos os clientes com formulário preenchido já tiveram o pipeline rodado.', data: [] };
  const top = rows.slice(0, 5).map(r => `· ${r.company_name}`).join('\n');
  return { summary: `${rows.length} cliente(s) sem pipeline:\n${top}`, data: rows };
}

async function cmdOnboardingsPendentes(params, tenantId /*, userId */) {
  console.log('[INFO][Jarvis:OnboardingsPendentes]', { tenantId });

  const rows = await query(
    `SELECT op.client_id, op.current_stage, op.last_response_at, mc.company_name
     FROM onboarding_progress op
     JOIN marketing_clients mc ON mc.id = op.client_id
     WHERE mc.tenant_id = $1
       AND op.last_response_at < now() - INTERVAL '3 days'
     ORDER BY op.last_response_at ASC
     LIMIT 30`,
    [tenantId]
  ).catch(() => []);

  if (!rows.length) return { summary: 'Nenhum onboarding travado há mais de 3 dias.', data: [] };
  const top = rows.slice(0, 5).map(r => `· ${r.company_name} (etapa ${r.current_stage})`).join('\n');
  return { summary: `${rows.length} onboarding(s) travado(s):\n${top}`, data: rows };
}

/* ═════════════════════════════════════════════════════════════════════════
   GRUPO 5 — FORMULÁRIO
═════════════════════════════════════════════════════════════════════════ */

async function cmdClientesSemFormulario(params, tenantId) {
  console.log('[INFO][Jarvis:ClientesSemFormulario]', { tenantId });

  const rows = await query(
    `SELECT mc.id, mc.company_name, mc.phone, mc.email
     FROM marketing_clients mc
     WHERE mc.tenant_id = $1 AND mc.form_done = false
     ORDER BY mc.company_name ASC
     LIMIT 30`,
    [tenantId]
  );

  if (!rows.length) return { summary: 'Todos os clientes já preencheram o formulário de briefing.', data: [] };

  const top = rows.slice(0, 10).map(r => {
    const contact = r.phone ? ` (${r.phone})` : r.email ? ` (${r.email})` : '';
    return `· ${r.company_name}${contact}`;
  }).join('\n');

  return {
    summary: `${rows.length} cliente(s) ainda não preencheram o formulário:\n${top}`,
    data: rows,
  };
}

async function cmdEnviarFormulario(params, tenantId, userId) {
  console.log('[INFO][Jarvis:EnviarFormulario]', { tenantId, userId, params });

  const nome = (params?.nome || '').trim();
  if (!nome) return { summary: 'Informe o nome do cliente para quem deseja enviar o formulário.', data: null };

  // Bloqueia "enviar para todos"
  if (/\btodos\b|\btodas\b|\bgeral\b/i.test(nome)) {
    return {
      summary: 'Por segurança, não é permitido enviar o formulário para todos os clientes de uma vez. Informe o nome de um cliente específico.',
      data: null,
    };
  }

  const client = await findClientByName(tenantId, nome);
  if (!client) return { summary: `Não encontrei nenhum cliente com o nome "${nome}". Verifique o nome e tente novamente.`, data: null };

  // Verifica se já preencheu
  if (client.form_done) {
    return {
      summary: `${client.company_name} já preencheu o formulário de briefing. Não é necessário enviar novamente.`,
      data: null,
    };
  }

  // Verifica se tem telefone cadastrado
  const fullClient = await queryOne(
    `SELECT id, company_name, phone, email FROM marketing_clients WHERE id = $1`,
    [client.id]
  );

  if (!fullClient?.phone) {
    return {
      summary: `${client.company_name} não tem telefone cadastrado. Cadastre o número do cliente antes de enviar o formulário via WhatsApp.`,
      data: null,
    };
  }

  const preview = {
    client_id: client.id,
    client_name: client.company_name,
    phone: fullClient.phone,
  };

  return {
    summary: `Formulário de briefing será enviado via WhatsApp para ${client.company_name} (${fullClient.phone}). Confirme para enviar.`,
    data: preview,
    requiresConfirmation: true,
    confirmAction: 'send_form',
  };
}

/* ═════════════════════════════════════════════════════════════════════════
   DISPATCHER
═════════════════════════════════════════════════════════════════════════ */

const REGISTRY = {
  buscar_cliente:          cmdBuscarCliente,
  criar_tarefa:            cmdCriarTarefa,
  tarefas_atrasadas:       cmdTarefasAtrasadas,
  resumo_do_dia:           cmdResumoDoDia,
  tarefas_usuario:         cmdTarefasDeOutroUsuario,
  parcelas_vencendo:       cmdParcelasVencendo,
  resumo_financeiro:       cmdResumoFinanceiro,
  registrar_receita:       cmdRegistrarReceita,
  registrar_despesa:       cmdRegistrarDespesa,
  status_pipeline:         cmdStatusPipeline,
  gerar_resumo:            cmdGerarResumoCliente,
  metricas_gerais:         cmdMetricasGerais,
  clientes_sem_pipeline:   cmdClientesSemPipeline,
  onboardings_pendentes:   cmdOnboardingsPendentes,
  clientes_sem_formulario: cmdClientesSemFormulario,
  enviar_formulario:       cmdEnviarFormulario,
};

/**
 * Executa uma tool pelo nome.
 * @returns {Promise<{ summary: string, data: any, requiresConfirmation?: boolean, confirmAction?: string }>}
 */
async function executeCommand(toolName, toolArgs, tenantId, userId, userRole) {
  const fn = REGISTRY[toolName];
  if (!fn) {
    console.warn('[ERRO][Jarvis:Dispatcher] Tool desconhecida', { toolName });
    return { summary: `Função "${toolName}" não está registrada no Jarvis.`, data: null };
  }
  return fn(toolArgs || {}, tenantId, userId, userRole);
}

module.exports = {
  executeCommand,
  REGISTRY,
};
