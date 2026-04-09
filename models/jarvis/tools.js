/**
 * @fileoverview models/jarvis/tools.js
 * Definições de tools (function calling) das 13 capacidades do Jarvis.
 *
 * Provê dois formatos:
 *   getToolDefinitions(enabledIds, 'openai')    → [{ type: 'function', function: {...} }, ...]
 *   getToolDefinitions(enabledIds, 'anthropic') → [{ name, description, input_schema }, ...]
 *
 * O parâmetro `enabledIds` filtra apenas as funções que estão ativas para o tenant.
 */

/**
 * Schema interno: cada tool define seu nome (que casa com models/jarvis/commands.js),
 * descrição, e os parâmetros (JSON Schema com properties + required).
 */
const TOOL_SCHEMAS = [
  // ── CLIENTES ──────────────────────────────────────────────────────────────
  {
    id: 'buscar_cliente',
    name: 'buscar_cliente',
    description: 'Busca um cliente por nome (ou parte do nome) e retorna um resumo com contratos ativos, parcelas e tarefas abertas. Use sempre que o usuário perguntar sobre a situação de um cliente específico.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome ou parte do nome do cliente.' },
      },
      required: ['nome'],
    },
  },
  {
    id: 'criar_tarefa',
    name: 'criar_tarefa',
    description: `Prepara a criação de uma tarefa. NÃO salva diretamente — retorna preview para confirmação.

TIPOS DE TASK QUE O USUÁRIO PODE PEDIR:
1. Task para um CLIENTE (tem client_name) — ex: "cria uma tarefa pro cliente X fazer Y"
2. Task PESSOAL (sem cliente, assigned_to = próprio usuário) — ex: "me lembra de fazer X"
3. Task para OUTRO MEMBRO (assigned_to_name diferente do usuário) — ex: "cria tarefa pra João fazer X"
4. Task RECORRENTE (is_recurring=true + frequency) — ex: "toda segunda, criar relatório", "todo dia 5, cobrar parcelas"

PARÂMETROS ESSENCIAIS POR TIPO:
- Toda task: title (obrigatório), priority, due_date
- Task de cliente: + client_name
- Task para outro: + assigned_to_name
- Task recorrente: + is_recurring=true, frequency, weekday (se weekly), day_of_month (se monthly)
- Opcionais sempre: description, category_name, subtasks

Se o usuário não especificar prioridade, use "normal".
IMPORTANTE: Se o usuário NÃO informou a data de vencimento e NÃO for recorrente, NÃO chame esta tool — pergunte "Para quando?" primeiro. Tarefas sem data não aparecem corretamente no sistema.
Se for recorrente, NÃO precisa de due_date (o cron gera as instâncias automaticamente).

SUBTASKS AUTOMÁTICAS: Para tarefas complexas com múltiplas etapas (ex: "montar proposta", "lançar campanha", "preparar relatório mensal", "criar landing page"), quebre proativamente em subtasks. Exemplo: "Montar proposta comercial" → subtasks: ["Levantar dados do cliente", "Definir escopo de serviços", "Montar apresentação", "Revisar valores e prazos", "Enviar para aprovação"]. Não pergunte — inclua quando a tarefa claramente se beneficia de decomposição.`,
    parameters: {
      type: 'object',
      properties: {
        title:             { type: 'string', description: 'Título curto e claro da tarefa.' },
        description:       { type: 'string', description: 'Descrição detalhada / contexto adicional.' },
        priority:          { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'], description: 'Prioridade. Default: normal.' },
        due_date:          { type: 'string', description: 'Data de vencimento. Formato YYYY-MM-DD ou expressão natural ("amanhã", "sexta", "próxima terça"). Ignorado se for task recorrente.' },
        client_name:       { type: 'string', description: 'Nome do cliente vinculado. Se vazio = task pessoal/interna.' },
        assigned_to_name:  { type: 'string', description: 'Nome do membro da equipe. Se vazio = atribuída ao próprio usuário.' },
        category_name:     { type: 'string', description: 'Nome da categoria da task (ex: "Desenvolvimento", "Design", "Financeiro"). Se não existir, será criada automaticamente.' },
        subtasks:          {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de subtarefas em texto. Ex: ["Fazer layout", "Revisar textos", "Publicar"]',
        },
        is_recurring:      { type: 'boolean', description: 'Se true, vira uma task recorrente (gera instâncias automaticamente pelo cron).' },
        frequency:         { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Frequência da recorrência. Obrigatório se is_recurring=true.' },
        weekday:           { type: 'integer', description: 'Dia da semana (0=domingo, 1=segunda... 6=sábado). Obrigatório se frequency=weekly.' },
        day_of_month:      { type: 'integer', description: 'Dia do mês (1-31). Obrigatório se frequency=monthly.' },
      },
      required: ['title'],
    },
  },
  {
    id: 'tarefas_atrasadas',
    name: 'tarefas_atrasadas',
    description: 'Lista todas as tarefas vencidas e ainda não concluídas, ordenadas pelas mais antigas. Use quando o usuário pedir tarefas atrasadas ou pendências antigas.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'listar_categorias_task',
    name: 'listar_categorias_task',
    description: 'Lista as categorias de tarefas disponíveis no sistema. Use quando o usuário perguntar "que categorias existem", "quais categorias de task tenho", ou antes de criar uma task quando precisar saber se uma categoria já existe.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'resumo_do_dia',
    name: 'resumo_do_dia',
    description: 'Resumo do que precisa de atenção HOJE: tarefas, parcelas vencendo, onboardings pendentes. Use para "o que tem para hoje", "agenda do dia", "resumo".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'tarefas_usuario',
    name: 'tarefas_usuario',
    description: 'Lista as tarefas atribuídas a OUTRO membro da equipe pelo nome dele. Apenas administradores podem usar. Use quando o usuário perguntar tarefas de "Fulano".',
    parameters: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: 'Nome (ou parte) do membro da equipe.' },
      },
      required: ['user_name'],
    },
  },

  // ── FINANCEIRO ────────────────────────────────────────────────────────────
  {
    id: 'parcelas_vencendo',
    name: 'parcelas_vencendo',
    description: 'Mostra parcelas vencendo nos próximos N dias (default: 7) e parcelas já em atraso. Use para "parcelas a receber", "quem está atrasado", "vencimentos".',
    parameters: {
      type: 'object',
      properties: {
        dias: { type: 'integer', description: 'Janela de dias futuros a considerar (default 7).' },
      },
      required: [],
    },
  },
  {
    id: 'resumo_financeiro',
    name: 'resumo_financeiro',
    description: 'Faturamento do mês corrente, valor pendente a receber, parcelas atrasadas e despesas/receitas registradas. Use para "como está o financeiro", "quanto faturei este mês".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'registrar_receita',
    name: 'registrar_receita',
    description: 'Prepara o registro de uma receita da empresa em company_finances. NÃO salva — retorna preview para confirmação. Use quando o usuário disser "registra uma entrada de X reais".',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Descrição curta da receita.' },
        value:       { type: 'number', description: 'Valor em reais (numérico, sem símbolo).' },
        category:    { type: 'string', description: 'Categoria opcional (ex: "Cliente A", "Bônus").' },
        date:        { type: 'string', description: 'Data em formato YYYY-MM-DD. Se omitido, usar hoje.' },
      },
      required: ['description', 'value'],
    },
  },
  {
    id: 'registrar_despesa',
    name: 'registrar_despesa',
    description: 'Prepara o registro de uma despesa da empresa. NÃO salva — retorna preview para confirmação. Use quando o usuário disser "lança uma despesa de X".',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Descrição curta da despesa.' },
        value:       { type: 'number', description: 'Valor em reais.' },
        category:    { type: 'string', description: 'Categoria (ex: "Software", "Marketing").' },
        date:        { type: 'string', description: 'Data YYYY-MM-DD (default hoje).' },
      },
      required: ['description', 'value'],
    },
  },

  // ── PIPELINE & IA ─────────────────────────────────────────────────────────
  {
    id: 'status_pipeline',
    name: 'status_pipeline',
    description: 'Verifica o status de cada etapa do pipeline estratégico (diagnosis, competitors, audience, avatar, positioning) para um cliente específico.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente.' },
      },
      required: ['nome'],
    },
  },
  {
    id: 'gerar_resumo',
    name: 'gerar_resumo',
    description: 'Prepara a geração do resumo estratégico de IA de um cliente a partir das respostas do formulário. Retorna preview para confirmação antes de disparar a geração (consome tokens).',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente.' },
      },
      required: ['nome'],
    },
  },

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  {
    id: 'metricas_gerais',
    name: 'metricas_gerais',
    description: 'Visão geral do sistema: total de clientes ativos, pipelines rodados nos últimos 30 dias, tokens consumidos no mês e faturamento aproximado.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'clientes_sem_pipeline',
    name: 'clientes_sem_pipeline',
    description: 'Clientes que já preencheram o formulário, mas que ainda não tiveram o pipeline estratégico rodado. Use para "quem está pendente de pipeline".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'onboardings_pendentes',
    name: 'onboardings_pendentes',
    description: 'Clientes com onboarding ativo travados há mais de 3 dias sem nova submissão. Use para "quem travou no onboarding".',
    parameters: { type: 'object', properties: {}, required: [] },
  },

  // ── FORMULÁRIO ───────────────────────────────────────────────────────────
  {
    id: 'clientes_sem_formulario',
    name: 'clientes_sem_formulario',
    description: 'Lista clientes que ainda NÃO preencheram o formulário de briefing (form_done = false). Use quando o usuário perguntar "quem não preencheu o formulário", "formulários pendentes", "quem falta preencher".',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    id: 'enviar_formulario',
    name: 'enviar_formulario',
    description: 'Envia o link do formulário de briefing para um cliente específico via WhatsApp. Gera o token, monta a mensagem e envia. Requer confirmação. Use quando o usuário disser "envia o formulário para o cliente X", "manda o link do form pro X".',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome (ou parte) do cliente que deve receber o formulário.' },
      },
      required: ['nome'],
    },
  },
];

/**
 * Retorna as tools no formato do provider escolhido, filtrando apenas as
 * habilitadas para o tenant.
 *
 * @param {string[]} enabledIds — IDs das funções habilitadas (vem do config).
 * @param {'openai'|'anthropic'} provider
 */
/**
 * Retorna todos os IDs de tools existentes.
 */
function getAllToolIds() {
  return TOOL_SCHEMAS.map(t => t.id);
}

function getToolDefinitions(enabledIds, provider) {
  const allowed = new Set(enabledIds || []);
  const filtered = TOOL_SCHEMAS.filter(t => allowed.has(t.id));

  if (provider === 'anthropic') {
    return filtered.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  // default: openai
  return filtered.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

module.exports = {
  TOOL_SCHEMAS,
  getToolDefinitions,
  getAllToolIds,
};
