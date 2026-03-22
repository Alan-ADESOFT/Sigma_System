/**
 * @fileoverview Modelo exclusivo de melhoria de escrita
 * @route POST /api/agentes/improve-text
 *
 * Dois modos:
 *   mode: 'selection' — reescreve o trecho selecionado melhorando clareza
 *   mode: 'full'      — corrige apenas acentos, semantica e conjugacoes
 *
 * Usa modelo weak (gpt-4o-mini) para economia.
 */

import { resolveModel } from '../../../models/ia/completion';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

const PROMPT_SELECTION = `Voce e um editor de texto profissional de portugues brasileiro.

Recebeu um TRECHO selecionado de um documento de marketing. Sua tarefa:
1. Melhore a clareza e fluidez do trecho
2. Corrija erros de gramatica, ortografia e acentuacao
3. Mantenha o significado e tom originais
4. Mantenha a formatacao markdown (**, *, ##, ###, -)
5. Retorne APENAS o trecho melhorado, nada mais

NAO adicione informacoes novas. NAO mude a estrutura.`;

const PROMPT_FULL = `Voce e um revisor linguistico de portugues brasileiro.

Recebeu um documento completo de marketing. Sua tarefa e EXCLUSIVAMENTE:
1. Corrigir acentuacao (ex: "analise" -> "analise", "estrategia" -> "estrategia")
2. Corrigir conjugacoes verbais erradas
3. Corrigir concordancia nominal e verbal
4. Corrigir ortografia
5. Manter pontuacao adequada

REGRAS ABSOLUTAS:
- NAO reescreva frases — apenas corrija erros linguisticos
- NAO mude palavras por sinonimos
- NAO altere a estrutura, ordem ou formatacao do texto
- NAO adicione nem remova conteudo
- Mantenha toda formatacao markdown (**, *, ##, ###, -)
- Retorne o documento INTEIRO com as correcoes aplicadas`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Metodo nao permitido' });

  const { text, mode = 'full' } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'text obrigatorio' });

  try {
    const model = resolveModel('weak');
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY nao configurada');

    const systemPrompt = mode === 'selection' ? PROMPT_SELECTION : PROMPT_FULL;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error?.message || r.statusText); }
    const d = await r.json();
    return res.json({ success: true, data: { text: d.choices?.[0]?.message?.content || text } });
  } catch (err) {
    console.error('[ERRO][ImproveText]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
