/**
 * @fileoverview Prompt builder do CopyCreator
 * @description Monta os prompts para geracao e modificacao de copy.
 *
 * Hierarquia do prompt de GERACAO:
 *   1. Base de dados do cliente (KB + dados) → assertividade
 *   2. Prompt raiz da estrutura (se selecionada) → diretriz principal
 *      - Se NAO tem estrutura → texto do usuario = instrucao principal
 *      - Se TEM estrutura → texto do usuario = pedidos extras do operador
 *   3. Extras: tom de comunicacao, imagens, arquivos
 *
 * Hierarquia do prompt de MODIFICACAO:
 *   1. Regras: retornar texto COMPLETO, so aplicar as mudancas
 *   2. Copy atual (texto completo pra IA ter contexto)
 *   3. Contexto do cliente (resumido)
 *   4. Extras: imagens, arquivos
 *
 * Pos-geracao:
 *   Texto gerado → formatCopyOutput() → texto formatado pro editor
 */

const { resolveModel } = require('../ia/completion');

// ── GERACAO ──────────────────────────────────────────────────

/**
 * Monta o system prompt para gerar copy do zero
 * @param {object} opts
 * @param {string} [opts.clientSummary] - Resumo do cliente (empresa, nicho, produto...)
 * @param {string} [opts.kbContext] - Base de conhecimento estrategico do cliente
 * @param {string} [opts.structureName] - Nome da estrutura selecionada
 * @param {string} [opts.structurePrompt] - prompt_base da estrutura
 * @param {string} [opts.tone] - Tom de comunicacao livre
 * @param {string} [opts.imagesDescription] - Descricao das imagens (via vision)
 * @param {string} [opts.filesContent] - Conteudo extraido dos arquivos
 * @returns {string} System prompt completo
 */
function buildGenerateSystem({ clientSummary, kbContext, structureName, structurePrompt, tone, imagesDescription, filesContent }) {
  let prompt = `PAPEL: Voce e um copywriter estrategico da agencia Sigma.
Sua missao e criar copies profissionais, persuasivas e personalizadas.
Use os dados do cliente para ser preciso e assertivo.`;

  // 1. Base de dados do cliente (para assertividade)
  if (clientSummary || kbContext) {
    prompt += `\n\n══ BASE DE DADOS DO CLIENTE ══
Use essas informacoes para personalizar e ser assertivo na copy.`;
    if (clientSummary) prompt += `\n${clientSummary}`;
    if (kbContext) prompt += `\n\nCONHECIMENTO ESTRATEGICO:\n${kbContext}`;
  }

  // 2. Prompt raiz da estrutura (diretriz principal)
  if (structurePrompt) {
    prompt += `\n\n══ PROMPT RAIZ (estrutura: ${structureName || 'selecionada'}) ══
Siga esta estrutura como diretriz principal da copy:

${structurePrompt}

O operador pode enviar instrucoes adicionais abaixo. Aplique-as SOBRE esta estrutura.`;
  }

  // 3. Extras
  if (tone) {
    prompt += `\n\n══ TOM DE COMUNICACAO ══
Escreva com tom: ${tone}
Adapte linguagem, vocabulario e ritmo de acordo.`;
  }

  if (filesContent) {
    prompt += `\n\n══ DOCUMENTOS ANEXADOS ══
Use como referencia e contexto adicional:
${filesContent}`;
  }

  if (imagesDescription) {
    prompt += `\n\n══ IMAGENS ANEXADAS ══
Descricao das imagens enviadas pelo operador:
${imagesDescription}`;
  }

  return prompt;
}

/**
 * Monta a mensagem do usuario (user message) para geracao
 * Se tem estrutura → texto do usuario = instrucoes extras do operador
 * Se nao tem → texto do usuario = instrucao principal (ele e o prompt)
 * @param {string} userText - Texto digitado pelo operador
 * @param {boolean} hasStructure - Se uma estrutura foi selecionada
 * @returns {string} User message formatada
 */
function buildGenerateUserMessage(userText, hasStructure) {
  if (hasStructure) {
    return `INSTRUCOES DO OPERADOR (aplique sobre a estrutura acima):\n\n${userText}`;
  }
  // Sem estrutura → o texto DO usuario E a instrucao principal
  return userText;
}

// ── MODIFICACAO ──────────────────────────────────────────────

/**
 * Monta o system prompt para modificar copy existente
 * Regra central: SEMPRE retornar o texto COMPLETO
 * @param {object} opts
 * @param {string} opts.currentOutput - Copy atual completa
 * @param {string} [opts.clientContext] - Resumo do cliente (empresa | nicho | produto)
 * @param {string} [opts.imagesDescription] - Descricao das imagens
 * @param {string} [opts.filesContent] - Conteudo dos arquivos
 * @returns {string} System prompt completo
 */
function buildModifySystem({ currentOutput, clientContext, imagesDescription, filesContent }) {
  let prompt = `PAPEL: Voce e um copywriter estrategico da agencia Sigma.
O operador vai pedir uma modificacao na copy existente abaixo.

══ REGRAS ABSOLUTAS ══
1. SEMPRE retorne o TEXTO COMPLETO da copy — nunca apenas o trecho modificado
2. Se pedir para ADICIONAR → retorne TODO o texto original + o trecho novo no local correto
3. Se pedir para TROCAR → retorne TODO o texto com a parte substituida
4. Se pedir para REMOVER → retorne TODO o texto sem a parte removida
5. Se pedir para REFORMULAR → retorne TODO o texto com o trecho reescrito
6. Mantenha a formatacao, estrutura e secoes do texto original
7. NAO resuma, NAO encurte, NAO omita partes que nao foram mencionadas`;

  if (clientContext) {
    prompt += `\n\n══ CONTEXTO DO CLIENTE ══\n${clientContext}`;
  }

  if (filesContent) {
    prompt += `\n\n══ DOCUMENTOS ANEXADOS ══\n${filesContent}`;
  }

  if (imagesDescription) {
    prompt += `\n\n══ IMAGENS ANEXADAS ══\n${imagesDescription}`;
  }

  prompt += `\n\n══ COPY ATUAL (aplique as modificacoes SOBRE este texto) ══
${currentOutput || '(vazio)'}`;

  return prompt;
}

// ── FORMATACAO POS-GERACAO ───────────────────────────────────

/**
 * Passa o texto gerado pela IA de formatacao (modelo weak)
 * para organizar titulos, negritos, listas etc. pro editor
 * @param {string} text - Texto bruto gerado
 * @returns {Promise<string>} Texto formatado (ou original se falhar)
 */
async function formatCopyOutput(text) {
  if (!text) return text;

  try {
    const model = resolveModel('weak');
    const key = process.env.OPENAI_API_KEY;
    if (!key) return text;

    console.log('[INFO][CopyPrompt] Formatando output via IA');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 4000,
        messages: [
          { role: 'system', content: FORMAT_SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!r.ok) return text;
    const d = await r.json();
    const formatted = d.choices?.[0]?.message?.content;
    return formatted || text;
  } catch (err) {
    console.error('[AVISO][CopyPrompt] Formatacao falhou, usando texto bruto', { error: err.message });
    return text;
  }
}

const FORMAT_SYSTEM = `Voce e um formatador de texto. Sua UNICA funcao e formatar o texto recebido para exibicao em um editor rich-text.

REGRAS:
1. NAO altere o conteudo, significado ou estrutura do texto
2. NAO adicione nem remova informacoes
3. NAO reescreva frases — apenas formate

O QUE FAZER:
- Adicione ## antes de titulos de secao
- Adicione ### antes de subtitulos
- Envolva termos importantes, nomes, numeros e conclusoes com **negrito**
- Envolva termos tecnicos, citacoes e enfases com *italico*
- Converta listas para formato com - no inicio de cada item
- Paragrafos curtos (2-4 linhas)
- Linha em branco entre secoes
- NAO use blocos de codigo, tabelas HTML ou > citacoes

Retorne APENAS o texto formatado, completo, sem explicacoes.`;

// ── EXPORTS ──────────────────────────────────────────────────

module.exports = {
  buildGenerateSystem,
  buildGenerateUserMessage,
  buildModifySystem,
  formatCopyOutput,
};
