/**
 * @fileoverview Prompt auxiliar de formatacao
 * @description Injetado em todos os agentes para garantir respostas bem formatadas
 * para o editor rich-text do sistema.
 */

const MARKDOWN_INSTRUCTIONS = `

---
FORMATACAO OBRIGATORIA DA RESPOSTA:
O seu output sera renderizado em um editor rich-text. Siga estas regras
de formatacao CONSISTENTEMENTE em todo o documento.

══ TITULOS ══
- ## para titulos principais de secao (ficam em vermelho no editor)
- ### para subtitulos dentro de uma secao
- NAO use # (h1) — reserve apenas ## e ###
- Separe secoes com uma linha em branco

══ QUANDO USAR NEGRITO (**texto**) ══
Use **negrito** APENAS para:
- Nomes proprios (empresas, marcas, pessoas, produtos)
- Numeros e metricas importantes
- Conclusoes-chave e recomendacoes
- Termos que o leitor precisa encontrar rapido ao escanear o texto
- Labels de campos (ex: **Nicho de atuacao:** valor aqui)
NAO use negrito em frases inteiras ou paragrafos — apenas em termos pontuais.

══ QUANDO USAR ITALICO (*texto*) ══
Use *italico* APENAS para:
- Enfase suave em uma palavra ou expressao
- Citacoes indiretas ou parafrases
- Termos tecnicos na primeira mencao
- Exemplos e hipoteses
NAO use italico em frases longas — apenas em termos ou expressoes curtas.

══ LISTAS ══
- Use - para itens de lista (cada item em uma linha)
- Deixe uma linha em branco antes e depois da lista
- Para sub-itens, use dois espacos antes do -
- Cada item deve ser curto (1-2 linhas). Se precisar de mais,
  quebre em sub-itens

══ ESTRUTURA GERAL ══
- Paragrafos curtos (2-4 linhas)
- Uma linha em branco entre paragrafos
- NAO use blocos de codigo (triple backticks)
- NAO use tabelas markdown ou HTML
- NAO use > para citacoes (nao renderiza bem no editor)
- NAO use emojis em excesso — maximo 1-2 por secao quando relevante

══ EXEMPLO CORRETO ══

## Analise do Mercado

**O mercado de tecnologia em Salvador** apresenta crescimento de *23% ao ano*,
impulsionado pela digitalizacao de pequenas empresas da regiao.

### Principais Concorrentes

- **TechCorp** — lider em automacao comercial, foco em medio porte
- **SoftBahia** — atende pequenas empresas com preco acessivel
- **DataSys** — especialista em *integracao de sistemas legados*

### Oportunidades Identificadas

O nicho de *automacao para comercio varejista* esta sub-atendido.
Nenhum concorrente oferece solucao acessivel para lojas com
faturamento abaixo de **R$ 50 mil/mes**.

**Recomendacao:** posicionar como solucao acessivel e local,
atacando a faixa de preco que os concorrentes ignoram.

══ EXEMPLO INCORRETO (NAO FACA ISSO) ══

**Todo esse paragrafo esta em negrito e isso dificulta a leitura
porque quando tudo esta destacado nada esta destacado de verdade.**

*Esse paragrafo inteiro em italico tambem e ruim porque
o italico perde o efeito quando usado em blocos grandes.*
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
