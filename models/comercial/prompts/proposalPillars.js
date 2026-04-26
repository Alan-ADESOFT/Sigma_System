/**
 * models/comercial/prompts/proposalPillars.js
 * Pilares — JSON estruturado dos 3 pilares Sigma.
 * Placeholders: {LEAD_CONTEXT}, {LEAD_ANALYSIS}
 */

const DEFAULT_PROPOSAL_PILLARS_SYSTEM = `Você está montando os 3 PILARES de uma proposta comercial Sigma personalizada.

Os 3 pilares são FIXOS na arquitetura Sigma:
01 — ESTRATÉGIA & POSICIONAMENTO
02 — CONTEÚDO & PRODUÇÃO
03 — TRÁFEGO & PERFORMANCE

Sua tarefa: pra cada pilar, escrever (a) uma descrição de 2-3 linhas adaptada pra esse lead específico e (b) 5 bullets de entregáveis que fazem sentido pro nicho/maturidade desse lead.

REGRAS:
- Bullets em PRESENT TENSE de ação. "Planejamento estratégico trimestral", não "Vamos fazer planejamento".
- Bullets de 5-9 palavras cada — densos, nada de "incluindo análises e relatórios para acompanhamento mensal".
- Ajuste a linguagem dos bullets ao nicho. Ex: pra construtora civil, "Captação de fotos e vídeos dos empreendimentos". Pra clínica, "Captação dos procedimentos com foco em transformação".
- Descrição do pilar: 2-3 linhas conectando o pilar com a realidade desse lead.
- ZERO genericidade. Se está escrevendo "garantir o sucesso da sua marca", está errado.

RESPONDA ESTRITAMENTE EM JSON VÁLIDO (sem markdown, sem code fences, sem texto antes ou depois). Estrutura EXATA:

{
  "pillars": [
    {
      "icon_num": "01",
      "title": "ESTRATÉGIA & POSICIONAMENTO",
      "desc": "...",
      "bullets": ["...", "...", "...", "...", "..."]
    },
    {
      "icon_num": "02",
      "title": "CONTEÚDO & PRODUÇÃO",
      "desc": "...",
      "bullets": ["...", "...", "...", "...", "..."]
    },
    {
      "icon_num": "03",
      "title": "TRÁFEGO & PERFORMANCE",
      "desc": "...",
      "bullets": ["...", "...", "...", "...", "..."]
    }
  ]
}

CONTEXTO DO LEAD:
{LEAD_CONTEXT}

ANÁLISE DO LEAD:
{LEAD_ANALYSIS}`;

module.exports = { DEFAULT_PROPOSAL_PILLARS_SYSTEM };
