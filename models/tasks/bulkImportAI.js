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

0. COMPLETUDE (a regra mais importante): extraia TODOS os afazeres do texto, sem exceção. NÃO resuma, NÃO agrupe, NÃO omita nenhum item. Prefira gerar tarefas demais a deixar faltar. Ao terminar, confira mentalmente se cada linha de afazer do texto virou pelo menos uma tarefa.
1. UMA LINHA = UMA TAREFA: cada item/linha de afazer vira UMA tarefa separada. NUNCA funda dois afazeres numa só — "gravar os vídeos" e "editar os vídeos" são DUAS tarefas distintas, mesmo que sequenciais. Se uma linha tiver dois verbos de ação independentes (ex.: "organizar e passar para o X montar"), pode manter junto se for uma ação só; mas se forem etapas claramente separadas com responsáveis ou momentos diferentes, separe.
2. ESTRUTURA POR CLIENTE: os afazeres costumam estar agrupados sob CABEÇALHOS de cliente (nome em MAIÚSCULAS numa linha isolada, ex.: "BENTIVI", "TRENATEC", "STYLLUS ÓPTICA", "SERTEC.CON"). Todo afazer abaixo de um cabeçalho pertence àquele cliente, até aparecer o próximo cabeçalho. Resolva client_id casando o cabeçalho com a lista de clientes (case-insensitive; ignore acentos e sufixos como ".CON"/".com"). Se o cabeçalho não casar com nenhum cliente da lista, deixe client_id null (NÃO invente) — mas ainda assim crie a tarefa.
3. FORMATO DA LINHA: o padrão comum é "Descrição - Responsável - Dia" (a ordem de Responsável e Dia pode variar). Use o nome do Responsável para assigned_to (casando com a lista de usuários) e o Dia da semana para due_date.
4. PRÓXIMA SEMANA: blocos marcados "(PRÓXIMA SEMANA)" ou "(SEMANA QUE VEM)" contêm afazeres da semana SEGUINTE à de referência — inclua-os também (NÃO omita), com due_date caindo na semana seguinte à de referência.
5. NUNCA invente usuários, clientes ou categorias. Só use os IDs listados acima.
6. Se a ata mencionar uma pessoa que não está na lista de usuários → use o fallback "${fallbackUserId}" e gere warning. Se o afazer não tiver responsável explícito → use o fallback.
7. Datas DEVEM estar no formato YYYY-MM-DD. Horários no formato HH:MM (24h) ou null. due_date sempre dentro ou depois da semana de referência (nunca no passado).
8. Prioridade: um de "baixa" | "normal" | "alta" | "urgente". Default = "normal".
9. SUBTAREFAS: se um afazer se desdobrar em sub-itens (lista aninhada, pauta de reunião, ou "fazer X: a, b, c"), quebre esses sub-itens em "subtasks". Ex.: "Executar alterações: alterar biografia, alterar outdoor" → 1 tarefa "Executar alterações" com 2 subtasks. Não invente subtasks que não estão no texto.
10. Description é opcional — só preencha se houver contexto útil que não cabe no título.
11. CATEGORIA: sempre escolha a categoria mais adequada entre as listadas (ex: CLIENTES para trabalho de cliente, COMERCIAL para vendas/prospecção, SISTEMA para tarefas internas/técnicas, FINANCEIRO para cobrança/pagamentos, CONTABILIDADE para notas/impostos, OUTROS para o resto). Só deixe category_id nulo se realmente nenhuma se aplicar.
12. REUNIÕES: se a ata marcar/agendar reuniões (com data, e às vezes hora e participantes), extraia em "meetings" separado das tarefas. Não duplique uma reunião como tarefa. Inclua também reuniões citadas dentro dos afazeres (ex.: "marcar reunião com X"). client_id da reunião só se um cliente da lista estiver claramente associado, senão null.
13. PARTICIPANTES da reunião: lista de NOMES (texto livre). Quando o nome corresponder a um usuário da lista acima, use EXATAMENTE o nome como está cadastrado (pra casar no sistema); nomes externos (não-usuários) podem entrar como vieram. Preencha todos os mencionados.
14. OBSERVAÇÕES da reunião ("description"): quando o texto trouxer pauta, tópicos ou contexto da reunião, resuma em 1-2 frases (ex.: "Apresentar criativo; pedir acesso ao Spotify; alinhar valores"). Se não houver contexto além do título, deixe null. NÃO invente.

# Saída

Responda APENAS com JSON válido e COMPACTO (sem indentação nem espaços extras; títulos curtos), sem markdown, sem fences, sem texto antes ou depois. Estrutura:

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

  // Acha o primeiro { — defensivo contra prefixos tipo "Aqui está:"
  const first = txt.indexOf('{');
  if (first === -1) {
    throw new Error('Resposta da IA não contém JSON válido');
  }
  txt = txt.slice(first);

  // 1) tentativa direta (até o último '}')
  const last = txt.lastIndexOf('}');
  const direct = last !== -1 ? txt.slice(0, last + 1) : txt;
  try {
    return JSON.parse(direct);
  } catch (err) {
    // 2) JSON truncado (output estourou o limite de tokens)? Tenta reparar:
    //    corta no último objeto completo e fecha os arrays/objetos abertos,
    //    salvando o prefixo válido (ex.: as primeiras N tarefas da lista cortada).
    const repaired = repairTruncatedJson(txt);
    if (repaired) {
      try {
        const obj = JSON.parse(repaired);
        if (obj && typeof obj === 'object') {
          obj._repaired = true;
          console.warn('[WARN][bulkImport] JSON truncado reparado — alguns itens podem ter ficado de fora');
          return obj;
        }
      } catch { /* cai no throw abaixo */ }
    }
    throw new Error(`JSON malformado da IA: ${err.message}`);
  }
}

/**
 * Repara JSON truncado: encontra o último objeto completo (último '}' fora de
 * string), descarta o item parcial e fecha os arrays/objetos que ficaram abertos.
 */
function repairTruncatedJson(s) {
  let inStr = false, esc = false, lastObjEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '}') lastObjEnd = i;
  }
  if (lastObjEnd === -1) return null;
  let head = s.slice(0, lastObjEnd + 1);

  inStr = false; esc = false;
  const stack = [];
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  head = head.replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) head += stack[i] === '{' ? '}' : ']';
  return head;
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
  const userMessage = `Texto bruto da reunião / ata:\n\n${String(text).slice(0, 24000)}`;

  console.log('[INFO][bulkImport] chamando IA', {
    chars: text.length, users: users.length, clients: clients.length,
  });

  const completion = await runCompletion(
    'medium',
    system,
    userMessage,
    16000, // teto do gpt-4o (16384) — ata grande gera muito JSON; evita truncar
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

  // Se o JSON foi reparado (output truncado), avisa que pode ter faltado item.
  if (parsed && parsed._repaired) {
    warnings.unshift('A ata era grande e a resposta da IA foi cortada — alguns afazeres podem ter ficado de fora. Confira a lista; se faltou algo, rode de novo (ou em duas levas).');
  }

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
