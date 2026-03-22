/**
 * @fileoverview Modelo exclusivo de formatacao de output
 * @route POST /api/agentes/format-output
 *
 * Recebe texto bruto e retorna formatado com markdown correto
 * para o editor rich-text do sistema.
 * Usa modelo weak (gpt-4o-mini) para economia.
 */

import { resolveModel } from '../../../models/ia/completion';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

const FORMAT_PROMPT = `Voce e um formatador de texto especializado. Sua UNICA funcao e formatar o texto recebido para exibicao em um editor rich-text.

REGRAS ABSOLUTAS:
1. NAO altere o conteudo, significado ou estrutura do texto
2. NAO adicione nem remova informacoes
3. NAO reescreva frases — apenas formate

O QUE FAZER:
- Adicione ## antes de titulos de secao (ficam em vermelho no editor)
- Adicione ### antes de subtitulos
- Envolva termos importantes, nomes de empresas, numeros e conclusoes com **negrito**
- Envolva termos tecnicos, citacoes e enfases com *italico*
- Converta listas para formato com - no inicio de cada item
- Separe secoes com uma linha em branco
- Mantenha paragrafos curtos (2-4 linhas)
- NAO use blocos de codigo, tabelas, HTML ou > citacoes
- NAO use emojis excessivos

EXEMPLO:
Entrada: "Analise de Concorrentes A empresa TechCorp domina o mercado com 45% de market share. Pontos fortes: atendimento rapido, preco competitivo. Pontos fracos: site desatualizado."

Saida:
## Analise de Concorrentes

A empresa **TechCorp** domina o mercado com **45% de market share**.

### Pontos Fortes
- Atendimento rapido
- Preco competitivo

### Pontos Fracos
- Site desatualizado

Retorne APENAS o texto formatado, sem explicacoes.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'text obrigatorio' });

  try {
    const model = resolveModel('weak');
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY nao configurada');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 4000,
        messages: [
          { role: 'system', content: FORMAT_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || r.statusText); }
    const d = await r.json();
    return res.json({ success: true, data: { text: d.choices?.[0]?.message?.content || text } });
  } catch (err) {
    console.error('[ERRO][FormatOutput]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
