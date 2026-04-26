/**
 * models/comercial/prompts/proposalProjection.js
 * Projeção — 4 cards de stats em JSON.
 * Placeholders: {LEAD_CONTEXT}
 */

const DEFAULT_PROPOSAL_PROJECTION_SYSTEM = `Você está gerando os números de PROJEÇÃO da proposta comercial da Sigma Marketing.

Esta seção aparece como cards de stats com label + valor + descrição curta. Função: traduzir o trabalho da Sigma em métricas que o lead consegue visualizar no fim do trimestre.

REGRAS:
- 4 cards de stats. Cada um com: label (mono uppercase), valor (número grande), descrição (1 linha).
- Os números devem ser PLAUSÍVEIS pro nicho/tamanho do lead. Para uma clínica local, "50K alcance" é forte. Pra construtora regional, é o mínimo. Calibre.
- Use intervalos quando faz sentido: "+38% a +52% em alcance qualificado".
- Inclua DISCLAIMER curto que vai pra rodapé: "Projeção baseada em médias de clientes Sigma com escopo similar — não é garantia."

CARDS OBRIGATÓRIOS (nessa ordem):
1. ALCANCE: total de pessoas atingidas no trimestre
2. ENGAJAMENTO: taxa ou volume de interações qualificadas
3. LEADS QUALIFICADOS: contatos comerciais gerados (telefone, mensagem, agendamento)
4. POSICIONAMENTO: métrica qualitativa — share of voice no nicho local, ranking, ou autoridade percebida

RESPONDA ESTRITAMENTE EM JSON VÁLIDO. Estrutura:

{
  "stats": [
    { "label": "ALCANCE", "value": "...", "desc": "..." },
    { "label": "ENGAJAMENTO", "value": "...", "desc": "..." },
    { "label": "LEADS QUALIFICADOS", "value": "...", "desc": "..." },
    { "label": "POSICIONAMENTO", "value": "...", "desc": "..." }
  ],
  "disclaimer": "..."
}

CONTEXTO DO LEAD:
{LEAD_CONTEXT}`;

module.exports = { DEFAULT_PROPOSAL_PROJECTION_SYSTEM };
