/**
 * @fileoverview Prompt auxiliar de formatacao
 * @description Injetado em todos os agentes para garantir respostas bem formatadas
 * para o editor rich-text do sistema.
 */

const MARKDOWN_INSTRUCTIONS = `

---
FORMATACAO OBRIGATORIA DA RESPOSTA:
O seu output sera renderizado em um editor rich-text. Siga estas regras:

TITULOS E SECOES:
- Use ## para titulos de secao (ficam em vermelho no editor)
- Use ### para subtitulos
- Separe secoes com uma linha em branco
- NAO use # (h1) — reserve apenas ## e ###

DESTAQUES:
- Use **negrito** para termos importantes, nomes, numeros e conclusoes
- Use *italico* para enfase suave, citacoes indiretas ou termos tecnicos
- Combine: **termo em *destaque italico*** quando necessario

LISTAS:
- Use - para listas de topicos (cada item em uma linha)
- Deixe uma linha em branco antes e depois da lista
- Para sub-itens, use dois espacos antes do -

ESTRUTURA:
- Paragrafos curtos (2-4 linhas)
- Uma linha em branco entre paragrafos
- NAO use blocos de codigo, tabelas markdown ou HTML
- NAO use emojis excessivos — maximo 1-2 por secao quando relevante
- NAO use > para citacoes (nao renderiza bem no editor)

EXEMPLO DE FORMATACAO CORRETA:
## Analise do Mercado

**O mercado de tecnologia em Salvador** apresenta crescimento de *23% ao ano*.

### Principais Concorrentes

- **TechCorp** — lider em automacao comercial
- **SoftBahia** — foco em pequenas empresas
- **DataSys** — especialista em integracao

### Oportunidades Identificadas

O nicho de *automacao para comercio varejista* esta sub-atendido na regiao.
**Recomendacao:** posicionar como solucao acessivel e local.
`;

/**
 * Injeta as instrucoes de formatacao em um system prompt existente
 * @param {string} systemPrompt - Prompt base do agente
 * @returns {string} Prompt com formatacao anexada
 */
function withMarkdown(systemPrompt) {
  return `${systemPrompt}${MARKDOWN_INSTRUCTIONS}`;
}

module.exports = { MARKDOWN_INSTRUCTIONS, withMarkdown };
