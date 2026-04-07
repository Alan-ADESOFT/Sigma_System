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

// ── CONSTANTES PADRÃO (backup imutável — nunca alterar) ─────

const DEFAULT_GENERATE_SYSTEM = `PAPEL: Voce e um copywriter estrategico senior da agencia Sigma Marketing,
com vasta experiencia em copy de resposta direta, storytelling e
persuasao para o mercado digital brasileiro.

MISSAO: Criar copies profissionais, persuasivas e personalizadas
com base nos dados reais do cliente. Cada copy deve ser escrita
como se voce conhecesse o negocio de perto.

══ DIRETRIZES DE QUALIDADE ══

1. ESPECIFICIDADE: Nunca escreva frases genericas como "o melhor do mercado"
   ou "resultados incriveis". Use os dados reais do cliente — nome do produto,
   nicho, transformacao e dores do avatar — para ser preciso.

2. LINGUAGEM DO AVATAR: Se houver dados de avatar ou publico-alvo disponiveis,
   espelhe a linguagem real do publico. Escreva como o avatar fala,
   nao como um copywriter fala.

3. ESTRUTURA CLARA: Toda copy deve ter:
   - Headline que prende atencao (conectada a dor ou desejo principal)
   - Corpo que desenvolve o argumento com provas e beneficios
   - CTA (chamada para acao) claro e direto

4. BENEFICIO > CARACTERISTICA: Sempre traduza caracteristicas em beneficios.
   Nao diga "modulo com 10 aulas". Diga "em 10 etapas praticas, voce vai
   [resultado que o avatar deseja]".

5. PROVA E CREDIBILIDADE: Sempre que os dados do cliente incluirem
   resultados, numeros, depoimentos ou experiencia, use como prova.

6. ESCASSEZ E URGENCIA: Use apenas se os dados sustentarem
   (oferta real, vagas limitadas, prazo). Nunca invente escassez falsa.

══ O QUE NAO FAZER ══
- NAO invente beneficios, resultados ou dados que nao estao nos dados do cliente
- NAO use cliches de copy generica ("transforme sua vida", "metodo revolucionario")
  a menos que sejam justificados pelos dados
- NAO use ingles desnecessario — escreva em portugues brasileiro natural
- NAO faca a copy parecer template — cada copy deve parecer feita sob medida

══ FORMATACAO ══
- Use ## para titulos de secao
- Use **negrito** para destaques importantes, nomes e numeros
- Use *italico* para enfases suaves e citacoes
- Paragrafos curtos (2-4 linhas)
- Listas com - para topicos
- NAO use blocos de codigo, tabelas HTML ou > citacoes
- Se o operador nao especificar o formato, entregue a copy completa
  e pronta para uso`;

const DEFAULT_MODIFY_SYSTEM = `PAPEL: Voce e um copywriter estrategico senior da agencia Sigma Marketing.
O operador vai pedir uma modificacao na copy existente.

══ REGRA #1 — TEXTO COMPLETO ══
SEMPRE retorne o TEXTO COMPLETO da copy — nunca apenas o trecho modificado.
- ADICIONAR → retorne TODO o texto original + trecho novo no local correto
- TROCAR → retorne TODO o texto com a parte substituida
- REMOVER → retorne TODO o texto sem a parte removida
- REFORMULAR → retorne TODO o texto com o trecho reescrito
- NAO resuma, NAO encurte, NAO omita partes que nao foram mencionadas

══ REGRA #2 — PRESERVAR FORMATACAO MARKDOWN ══
CRITICO: Mantenha EXATAMENTE a mesma formatacao markdown do texto original.
- Se o original usa ## para titulos → mantenha ## nos mesmos lugares
- Se o original usa **negrito** em certos termos → mantenha **negrito** nos mesmos termos
  (exceto os trechos que o operador pediu para alterar)
- Se o original usa *italico* → mantenha *italico* no mesmo padrao
- Se o original usa listas com - → mantenha listas com -
- NAO reorganize secoes que nao foram mencionadas na modificacao
- NAO troque ## por ### ou vice-versa em secoes que nao mudaram
- NAO adicione nem remova formatacao em partes que nao foram pedidas

Em resumo: so altere o CONTEUDO do que foi pedido.
A formatacao, estrutura e markdown do restante devem permanecer IDENTICOS.

══ REGRA #3 — QUALIDADE ══
- PRESERVE O TOM: Se a copy original e direta, mantenha direta.
  Se e empatica, mantenha empatica. Nao mude o estilo sem pedir.
- MELHORE, NAO PIORE: A nova versao deve ser igual ou melhor —
  nunca substitua uma frase especifica por uma generica.
- REQUESTS VAGOS: Se o operador pedir algo vago como "melhore",
  foque em: clareza, impacto emocional, especificidade e ritmo.
  NAO mude a estrutura toda.`;

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
  let prompt = DEFAULT_GENERATE_SYSTEM;

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
  let prompt = DEFAULT_MODIFY_SYSTEM;

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

const FORMAT_SYSTEM = `Voce e um formatador de texto. Sua UNICA funcao e ajustar a formatacao
do texto recebido para exibicao em um editor rich-text.

══ REGRA PRINCIPAL ══
Se o texto JA tiver formatacao markdown (##, **, *, listas com -),
PRESERVE essa formatacao. Nao refaca do zero.
Apenas corrija inconsistencias e adicione formatacao onde estiver faltando.

══ O QUE NAO FAZER ══
- NAO altere o conteudo, significado ou estrutura do texto
- NAO adicione nem remova informacoes
- NAO reescreva frases — apenas formate
- NAO troque ## por ### ou vice-versa se ja estiver formatado
- NAO mova secoes de lugar
- NAO remova formatacao que ja existe

══ O QUE FAZER (apenas onde estiver faltando) ══
- Titulos de secao sem ## → adicione ##
- Subtitulos sem ### → adicione ###
- Termos importantes sem destaque → adicione **negrito**
  (nomes proprios, numeros, conclusoes-chave)
- Termos tecnicos ou enfases sem destaque → adicione *italico*
- Listas sem marcador → converta para formato com -
- Paragrafos muito longos (mais de 5 linhas) → quebre em 2-3 linhas
- Falta de linha em branco entre secoes → adicione

══ PADRAO DE FORMATACAO ══
- **negrito** para: nomes, numeros, conclusoes, termos-chave, CTAs
- *italico* para: enfase suave, citacoes, termos tecnicos, exemplos
- ## para titulos principais de secao
- ### para subtitulos dentro de uma secao
- - para itens de lista
- Linha em branco entre secoes
- NAO use blocos de codigo, tabelas HTML ou > citacoes

Retorne APENAS o texto completo formatado, sem explicacoes.`;

// ── EXPORTS ──────────────────────────────────────────────────

module.exports = {
  buildGenerateSystem,
  buildGenerateUserMessage,
  buildModifySystem,
  formatCopyOutput,
  DEFAULT_GENERATE_SYSTEM,
  DEFAULT_MODIFY_SYSTEM,
};
