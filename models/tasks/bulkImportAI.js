/**
 * models/tasks/bulkImportAI.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Importação em massa de tarefas via IA.
 *
 * Recebe um texto bruto (ata de reunião, lista de bullets, parágrafos livres)
 * e o contexto do tenant (users / clients / categories + semana de referência)
 * e devolve uma lista estruturada de tasks prontas pra preview e commit.
 *
 * Decisão de modelo: AI_MODEL_MEDIUM. Strong é overkill pra parsing estruturado
 * e Weak é arriscado pra resolver responsável quando o nome aparece truncado.
 *
 * Por que JSON estrito (sem markdown): a UI não tem segunda chance — se o
 * parse falhar, o usuário precisa ver erro claro. Tentar "recuperar" parcial
 * importa lixo silenciosamente. Melhor falhar alto.
 *
 * Tracking: `operationType: 'tasks_bulk_import'` em ai_token_usage via
 * runCompletion (logUsage é automático quando passamos opts.tenantId).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { runCompletion } = require('../ia/completion');

const PRIORITY_VALUES = ['baixa', 'normal', 'alta', 'urgente'];

/**
 * Monta o system prompt explicando a saída esperada.
 *
 * Mantemos os blocos de contexto (usuários, clientes, categorias) dentro do
 * system pra a IA tratar como "verdade de fundo" e não como dado a parsear.
 */
function buildSystemPrompt({ users, clients, categories, referenceWeek, fallbackUserId }) {
  const usersBlock = (users || [])
    .map((u) => `  - id: ${u.id} | nome: ${u.name}`)
    .join('\n') || '  (nenhum)';

  const clientsBlock = (clients || [])
    .map((c) => `  - id: ${c.id} | empresa: ${c.company_name || c.name}`)
    .join('\n') || '  (nenhum)';

  const categoriesBlock = (categories || [])
    .map((c) => `  - id: ${c.id} | nome: ${c.name}`)
    .join('\n') || '  (nenhuma)';

  return `Você é um assistente que extrai tarefas de uma ata de reunião ou texto livre e as estrutura para um sistema de gestão.

# Contexto do workspace

## Usuários disponíveis (responsáveis válidos)
${usersBlock}

## Clientes ativos
${clientsBlock}

## Categorias de tarefa
${categoriesBlock}

## Semana de referência
${referenceWeek} — quando o texto disser "segunda", "amanhã", "essa semana", interprete relativo a essa semana.

## Fallback de responsável
Se você não conseguir atribuir uma tarefa a um usuário específico, use o id "${fallbackUserId}" e adicione uma entrada em "warnings" explicando.

# Regras

1. NUNCA invente usuários, clientes ou categorias. Só use os IDs listados acima.
2. Se a ata mencionar uma pessoa que não está na lista de usuários → use o fallback e gere warning.
3. Se mencionar um cliente que não existe → deixe client_id como null e gere warning.
4. Datas DEVEM estar no formato YYYY-MM-DD. Horários no formato HH:MM (24h) ou null.
5. Prioridade: um de "baixa" | "normal" | "alta" | "urgente". Default = "normal".
6. Use due_date sempre dentro ou depois da semana de referência (nunca no passado).
7. Subtasks são opcionais — só inclua se a tarefa claramente quebra em sub-itens.
8. Description é opcional — só preencha se houver contexto útil que não cabe no título.
9. CATEGORIA: sempre escolha a categoria mais adequada entre as listadas (ex: CLIENTES para trabalho de cliente, COMERCIAL para vendas, SISTEMA para tarefas internas/técnicas, FINANCEIRO para cobrança/pagamentos, CONTABILIDADE para notas/impostos, OUTROS para o resto). Só deixe category_id nulo se realmente nenhuma se aplicar.
10. REUNIÕES: se a ata marcar/agendar reuniões (com data, e às vezes hora e participantes), extraia em "meetings" separado das tarefas. Não duplique uma reunião como tarefa. participants é uma lista de NOMES (texto livre, não IDs). client_id da reunião só se um cliente da lista estiver claramente associado, senão null.

# Saída

Responda APENAS com JSON válido (sem markdown, sem fences, sem texto antes ou depois). Estrutura:

{
  "tasks": [
    {
      "title": "string curta no imperativo",
      "description": "string ou null",
      "client_id": "id da lista ou null",
      "assigned_to": "id da lista (obrigatório — usar fallback se necessário)",
      "category_id": "id da lista ou null",
      "priority": "baixa|normal|alta|urgente",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM ou null",
      "subtasks": ["string", "..."]
    }
  ],
  "meetings": [
    {
      "title": "string curta (assunto da reunião)",
      "description": "string ou null",
      "meeting_date": "YYYY-MM-DD",
      "start_time": "HH:MM ou null",
      "participants": ["Nome 1", "Nome 2"],
      "client_id": "id da lista ou null"
    }
  ],
  "warnings": ["string explicando ambiguidades"]
}`;
}

/**
 * Faz o parse robusto da resposta — alguns modelos teimam em embrulhar JSON
 * em fences de markdown mesmo proibindo. Aceitamos os dois cenários, mas
 * não tentamos "fix-up" agressivo — se vier malformado é melhor falhar.
 */
function extractJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Resposta da IA vazia');
  }
  let txt = rawText.trim();

  // Tira fences ```json ... ``` se a IA tiver enfiado
  if (txt.startsWith('```')) {
    txt = txt.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();
  }

  // Acha o primeiro { e o último } — defensivo contra prefixos tipo "Aqui está:"
  const first = txt.indexOf('{');
  const last = txt.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('Resposta da IA não contém JSON válido');
  }
  const sliced = txt.slice(first, last + 1);

  try {
    return JSON.parse(sliced);
  } catch (err) {
    throw new Error(`JSON malformado da IA: ${err.message}`);
  }
}

/**
 * Validação leve — só normaliza o que dá. Erros graves (sem title, sem
 * assigned_to) vão pra "warnings" pra o usuário corrigir no preview, em vez de
 * derrubar a importação inteira.
 */
function normalizeTasks(raw, { fallbackUserId, validUserIds, validClientIds, validCategoryIds }) {
  const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const warnings = Array.isArray(raw?.warnings) ? [...raw.warnings] : [];

  const normalized = tasks.map((t, i) => {
    const title = (t?.title || '').trim();
    if (!title) {
      warnings.push(`Item #${i + 1} sem título — será ignorado.`);
      return null;
    }

    let assigned_to = t?.assigned_to || null;
    if (!assigned_to || !validUserIds.has(assigned_to)) {
      if (assigned_to) {
        warnings.push(`Responsável "${assigned_to}" inválido em "${title}" — atribuído ao criador.`);
      }
      assigned_to = fallbackUserId;
    }

    let client_id = t?.client_id || null;
    if (client_id && !validClientIds.has(client_id)) {
      warnings.push(`Cliente "${client_id}" inválido em "${title}" — removido.`);
      client_id = null;
    }

    let category_id = t?.category_id || null;
    if (category_id && !validCategoryIds.has(category_id)) {
      warnings.push(`Categoria "${category_id}" inválida em "${title}" — removida.`);
      category_id = null;
    }

    const priority = PRIORITY_VALUES.includes(t?.priority) ? t.priority : 'normal';

    // Datas: aceita YYYY-MM-DD; resto vira null e ganha warning
    let due_date = null;
    if (t?.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date)) {
      due_date = t.due_date;
    } else if (t?.due_date) {
      warnings.push(`Data inválida em "${title}": ${t.due_date} — limpada.`);
    }

    let due_time = null;
    if (t?.due_time && /^\d{2}:\d{2}(:\d{2})?$/.test(t.due_time)) {
      due_time = t.due_time.length === 5 ? `${t.due_time}:00` : t.due_time;
    }

    const subtasks = Array.isArray(t?.subtasks)
      ? t.subtasks
          .filter((s) => typeof s === 'string' && s.trim())
          .map((s) => ({ title: s.trim(), done: false }))
      : [];

    return {
      title,
      description: t?.description ? String(t.description).trim() : null,
      client_id,
      assigned_to,
      category_id,
      priority,
      due_date,
      due_time,
      subtasks,
    };
  }).filter(Boolean);

  return { tasks: normalized, warnings };
}

/**
 * Normaliza reuniões extraídas. participants fica como texto livre (a coluna
 * meetings.participants é TEXT[]). Itens sem título ou data viram warning.
 */
function normalizeMeetings(raw, { validClientIds, warnings }) {
  const meetings = Array.isArray(raw?.meetings) ? raw.meetings : [];

  return meetings.map((m, i) => {
    const title = (m?.title || '').trim();
    if (!title) {
      warnings.push(`Reunião #${i + 1} sem título — ignorada.`);
      return null;
    }

    let meeting_date = null;
    if (m?.meeting_date && /^\d{4}-\d{2}-\d{2}$/.test(m.meeting_date)) {
      meeting_date = m.meeting_date;
    }
    if (!meeting_date) {
      warnings.push(`Reunião "${title}" sem data válida — ajuste antes de salvar.`);
    }

    let start_time = null;
    if (m?.start_time && /^\d{2}:\d{2}(:\d{2})?$/.test(m.start_time)) {
      start_time = m.start_time.length === 5 ? `${m.start_time}:00` : m.start_time;
    }

    let client_id = m?.client_id || null;
    if (client_id && !validClientIds.has(client_id)) {
      warnings.push(`Cliente "${client_id}" inválido na reunião "${title}" — removido.`);
      client_id = null;
    }

    const participants = Array.isArray(m?.participants)
      ? m.participants.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
      : [];

    return {
      title,
      description: m?.description ? String(m.description).trim() : null,
      meeting_date,
      start_time,
      participants,
      client_id,
    };
  }).filter(Boolean);
}

/**
 * Entry point. Recebe o texto bruto + contexto, chama a IA e devolve a lista
 * normalizada + warnings.
 */
async function parseBulkImport({
  text,
  users = [],
  clients = [],
  categories = [],
  referenceWeek,
  fallbackUserId,
  tenantId,
}) {
  if (!text || !String(text).trim()) {
    throw new Error('Texto vazio — nada para importar.');
  }
  if (!fallbackUserId) {
    throw new Error('fallbackUserId obrigatório (criador da importação).');
  }

  const system = buildSystemPrompt({ users, clients, categories, referenceWeek, fallbackUserId });
  const userMessage = `Texto bruto da reunião / ata:\n\n${String(text).slice(0, 12000)}`;

  console.log('[INFO][bulkImport] chamando IA', {
    chars: text.length, users: users.length, clients: clients.length,
  });

  const completion = await runCompletion(
    'medium',
    system,
    userMessage,
    5000,
    {
      tenantId,
      operationType: 'tasks_bulk_import',
    }
  );

  const parsed = extractJSON(completion.text);
  const validUserIds = new Set(users.map((u) => u.id));
  const validClientIds = new Set(clients.map((c) => c.id));
  const validCategoryIds = new Set(categories.map((c) => c.id));

  const { tasks, warnings } = normalizeTasks(parsed, {
    fallbackUserId,
    validUserIds,
    validClientIds,
    validCategoryIds,
  });

  // Reuniões compartilham o mesmo array de warnings.
  const meetings = normalizeMeetings(parsed, { validClientIds, warnings });

  console.log('[SUCESSO][bulkImport]', {
    tasks: tasks.length, meetings: meetings.length, warnings: warnings.length, model: completion.modelUsed,
  });

  return {
    tasks,
    meetings,
    warnings,
    meta: {
      model: completion.modelUsed,
      tokens: completion.usage?.total || 0,
    },
  };
}

module.exports = {
  parseBulkImport,
  // Exportado pra teste / reuso eventual
  buildSystemPrompt,
  extractJSON,
  normalizeTasks,
  normalizeMeetings,
};
