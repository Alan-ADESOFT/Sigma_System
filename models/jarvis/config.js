/**
 * @fileoverview models/jarvis/config.js
 * Leitura/escrita de configurações do J.A.R.V.I.S.
 *
 * Configuração persiste em `settings` (key/value por tenant).
 * Chaves padronizadas:
 *   jarvis_model              → Model ID (ex: claude-sonnet-4-5)
 *   jarvis_voice_enabled      → 'true' | 'false'
 *   jarvis_elevenlabs_key     → API key da ElevenLabs (server-side only)
 *   jarvis_voice_id           → ID da voz da ElevenLabs
 *   jarvis_daily_limit_admin  → '40' por padrão
 *   jarvis_daily_limit_user   → '10' por padrão
 *   jarvis_language           → 'pt' | 'en'
 *   jarvis_fn_<id>            → 'true' | 'false' por função (13 funções)
 */

const { getSetting, setSetting } = require('../settings.model');
const { query, queryOne } = require('../../infra/db');

/* ─────────────────────────────────────────────
   Lista canônica das 13 funções do Jarvis
───────────────────────────────────────────── */
const JARVIS_FUNCTIONS = [
  // CLIENTES
  { id: 'buscar_cliente',          group: 'CLIENTES',         title: 'Situação do Cliente',     description: 'Pergunta sobre um cliente e recebe um resumo com contratos, parcelas e tarefas abertas.' },
  { id: 'criar_tarefa',            group: 'CLIENTES',         title: 'Criar Tarefa',            description: 'Cria tasks por voz/texto: para clientes, pessoais, para outros membros do time, e recorrentes (diária/semanal/mensal). Suporta categoria e subtarefas.' },
  { id: 'listar_categorias_task',  group: 'CLIENTES',         title: 'Categorias de Tarefas',   description: 'Lista as categorias de tarefas disponíveis no sistema para ajudar na criação de tasks.' },
  { id: 'tarefas_atrasadas',       group: 'CLIENTES',         title: 'Tarefas Atrasadas',       description: 'Lista todas as tarefas vencidas e lembretes pendentes, ordenadas pelas mais antigas.' },
  { id: 'resumo_do_dia',           group: 'CLIENTES',         title: 'Resumo do Dia',           description: 'Mostra o que tem para hoje: tarefas, prioridades, parcelas vencendo e onboardings pendentes.' },
  { id: 'tarefas_usuario',         group: 'CLIENTES',         title: 'Tarefas de outro usuário', description: 'Permite ver as tarefas atribuídas a outro membro da equipe. (Apenas administradores)' },

  // FINANCEIRO
  { id: 'parcelas_vencendo',       group: 'FINANCEIRO',       title: 'Parcelas Vencendo',       description: 'Mostra quais clientes têm parcelas vencendo nos próximos 7 dias ou já em atraso.' },
  { id: 'resumo_financeiro',       group: 'FINANCEIRO',       title: 'Resumo Financeiro',       description: 'Faturamento do mês, valor a receber, parcelas atrasadas e resultado líquido da empresa.' },
  { id: 'registrar_receita',       group: 'FINANCEIRO',       title: 'Registrar Entrada',       description: 'Registra uma receita na empresa com valor, categoria e descrição por voz ou texto.' },
  { id: 'registrar_despesa',       group: 'FINANCEIRO',       title: 'Registrar Despesa',       description: 'Registra uma despesa da empresa com valor, categoria e descrição por voz ou texto.' },

  // PIPELINE & IA
  { id: 'status_pipeline',         group: 'PIPELINE & IA',    title: 'Status do Pipeline',      description: 'Verifica quais etapas do pipeline estratégico foram concluídas para um cliente.' },
  { id: 'gerar_resumo',            group: 'PIPELINE & IA',    title: 'Gerar Resumo com IA',     description: 'Dispara a geração do resumo estratégico de um cliente a partir das respostas do formulário.' },

  // DASHBOARD
  { id: 'metricas_gerais',         group: 'DASHBOARD',        title: 'Métricas Gerais',         description: 'Visão geral do sistema: clientes ativos, pipelines rodados, tokens usados e faturamento.' },
  { id: 'clientes_sem_pipeline',   group: 'DASHBOARD',        title: 'Clientes sem Pipeline',   description: 'Lista clientes que preencheram o formulário mas ainda não tiveram o pipeline rodado.' },
  { id: 'onboardings_pendentes',   group: 'DASHBOARD',        title: 'Onboardings Pendentes',   description: 'Clientes com onboarding ativo que estão travados há mais de 3 dias sem nova submissão.' },

  // FORMULÁRIO
  { id: 'clientes_sem_formulario', group: 'FORMULÁRIO',       title: 'Clientes sem Formulário', description: 'Lista clientes que ainda não preencheram o formulário de briefing.' },
  { id: 'enviar_formulario',       group: 'FORMULÁRIO',       title: 'Enviar Formulário',       description: 'Envia o link do formulário de briefing para um cliente via WhatsApp.' },
];

const DEFAULTS = {
  jarvis_model:             'claude-sonnet-4-5',
  jarvis_voice_enabled:     'false',
  jarvis_elevenlabs_key:    '',
  jarvis_voice_id:          '21m00Tcm4TlvDq8ikWAM',
  jarvis_daily_limit_admin: '40',
  jarvis_daily_limit_user:  '10',
  jarvis_language:          'pt',
};

function fnKey(id) { return `jarvis_fn_${id}`; }

/**
 * Lê toda a config do Jarvis para um tenant. Retorna defaults para chaves
 * ausentes e o map completo de funções habilitadas.
 */
async function getJarvisConfig(tenantId) {
  console.log('[INFO][Jarvis:Config] getJarvisConfig', { tenantId });

  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = await getSetting(tenantId, key);
    if (v !== null && v !== undefined && v !== '') out[key] = v;
  }

  // Funções: padrão TRUE (todas ativas)
  const functions = {};
  for (const fn of JARVIS_FUNCTIONS) {
    const v = await getSetting(tenantId, fnKey(fn.id));
    functions[fn.id] = v === null || v === undefined ? true : v === 'true';
  }

  return { ...out, functions };
}

/**
 * Lê o limite diário com base no role do usuário.
 */
async function getDailyLimit(tenantId, userRole) {
  const role = (userRole || 'admin').toLowerCase();
  const isAdmin = role === 'admin' || role === 'god';
  const key  = isAdmin ? 'jarvis_daily_limit_admin' : 'jarvis_daily_limit_user';
  const v    = await getSetting(tenantId, key);
  const num  = parseInt(v, 10);
  if (Number.isFinite(num) && num > 0) return num;
  return isAdmin ? 40 : 40;
}

/**
 * Verifica se uma função específica do Jarvis está habilitada.
 */
async function isFunctionEnabled(tenantId, functionId) {
  const v = await getSetting(tenantId, fnKey(functionId));
  if (v === null || v === undefined) return true; // padrão ativo
  return v === 'true';
}

/**
 * Quantidade de comandos do Jarvis usados HOJE por um usuário (00:00 → agora).
 */
async function getTodayUsage(tenantId, userId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS c FROM jarvis_usage_log
     WHERE tenant_id = $1 AND user_id = $2
       AND created_at >= date_trunc('day', now())`,
    [tenantId, userId]
  );
  return row?.c || 0;
}

/**
 * Salva uma chave de configuração do Jarvis. Aceita qualquer chave que comece
 * com `jarvis_` para evitar abuso.
 */
async function saveJarvisSetting(tenantId, key, value) {
  if (typeof key !== 'string' || !key.startsWith('jarvis_')) {
    throw new Error('Chave inválida: precisa começar com jarvis_');
  }
  const v = value === null || value === undefined ? '' : String(value);
  await setSetting(tenantId, key, v);
  return true;
}

module.exports = {
  JARVIS_FUNCTIONS,
  DEFAULTS,
  fnKey,
  getJarvisConfig,
  getDailyLimit,
  isFunctionEnabled,
  getTodayUsage,
  saveJarvisSetting,
};
