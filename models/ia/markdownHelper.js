/**
 * @fileoverview Prompt auxiliar de formatação Markdown
 * @description Injetado em todos os agentes para garantir respostas bem formatadas.
 */

/**
 * Instruções de formatação Markdown injetadas em todo agente.
 * Append no system prompt antes de cada chamada de API.
 * @type {string}
 */
const MARKDOWN_INSTRUCTIONS = `

---
FORMATAÇÃO DA RESPOSTA:
- Use **negrito** para destacar termos importantes
- Use *itálico* para ênfase suave
- Use ### para subtítulos quando necessário
- Use listas com - para tópicos
- Use > para citações ou destaques
- Use [texto](url) para links (quando disponíveis)
- Use --- para separadores de seção
- Mantenha parágrafos curtos e escaneáveis
- NÃO use código ou blocos de código a menos que seja conteúdo técnico
`;

/**
 * Injeta as instruções de markdown em um system prompt existente
 * @param {string} systemPrompt - Prompt base do agente
 * @returns {string} Prompt com formatação anexada
 */
function withMarkdown(systemPrompt) {
  return `${systemPrompt}${MARKDOWN_INSTRUCTIONS}`;
}

module.exports = { MARKDOWN_INSTRUCTIONS, withMarkdown };
