/**
 * pages/api/form/generate-summary.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gera um resumo completo do cliente usando IA a partir das respostas do form.
 *
 * POST — Body: { clientId }
 * GET  — Query: ?clientId=xxx  (busca resumo existente)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';
import { runCompletion } from '../../../models/ia/completion';

const SYSTEM_PROMPT = `Você é um estrategista de marketing sênior da agência SIGMA.
Sua tarefa é analisar as respostas do formulário de briefing de um cliente e gerar um RESUMO ESTRATÉGICO COMPLETO.

O resumo deve ser organizado nas seguintes seções em Markdown:

## Visão Geral do Negócio
Quem é a empresa, nicho, tempo de mercado, modelo de atuação.

## Produtos e Serviços
O que vendem, o carro-chefe, margens, oportunidades não exploradas.

## Perfil do Cliente Ideal
Quem é o comprador real: demografia, comportamento, dores, desejos, gatilhos de compra.

## Dores Principais
As 3-5 maiores dores que o cliente do cliente enfrenta — com linguagem real.

## Desejos e Aspirações
O que o cliente do cliente realmente quer — o resultado final, não o produto.

## Cenário Competitivo
Concorrentes, posicionamento de preço, diferenciais, ameaças.

## Forças e Diferenciais
O que faz esse negócio forte, o que é difícil de copiar, prova social.

## Pontos de Atenção
Fraquezas, riscos, gaps na jornada, onde o dinheiro está vazando.

## Marketing Atual
O que já foi tentado, o que funcionou, o que não funcionou, maturidade digital.

## Objetivos e Metas
O que o cliente quer alcançar com o marketing, metas de faturamento, expansão.

## Recomendações Iniciais
3-5 ações estratégicas prioritárias baseadas em tudo que foi analisado.

REGRAS:
- Seja direto e estratégico, sem enrolação
- Use dados reais das respostas, cite trechos quando relevante
- Marque com ⚠️ pontos que precisam de atenção urgente
- Marque com 💡 oportunidades identificadas
- Use linguagem profissional mas acessível
- Responda em português brasileiro`;

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);

    // GET — busca resumo existente
    if (req.method === 'GET') {
      const { clientId } = req.query;
      if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

      const existing = await queryOne(
        `SELECT * FROM client_form_summaries WHERE client_id = $1`,
        [clientId]
      );

      return res.json({
        success: true,
        summary: existing || null,
      });
    }

    // POST — gera novo resumo
    if (req.method === 'POST') {
      const { clientId } = req.body;
      if (!clientId) return res.status(400).json({ success: false, error: 'clientId obrigatório' });

      console.log('[INFO][API:generate-summary] Gerando resumo IA', { clientId });

      // Busca as respostas do formulário
      const response = await queryOne(
        `SELECT r.data FROM client_form_responses r
         JOIN client_form_tokens t ON t.id = r.token_id
         WHERE t.client_id = $1 AND r.status = 'submitted'
         ORDER BY r.created_at DESC LIMIT 1`,
        [clientId]
      );

      if (!response || !response.data) {
        return res.status(404).json({ success: false, error: 'Nenhuma resposta submetida encontrada' });
      }

      // Busca nome do cliente para contexto
      const client = await queryOne(`SELECT company_name FROM marketing_clients WHERE id = $1`, [clientId]);

      // Monta o texto das respostas de forma legível
      const data = response.data;
      const answersText = Object.entries(data)
        .sort(([a], [b]) => {
          const [aS, aQ] = a.split('.').map(Number);
          const [bS, bQ] = b.split('.').map(Number);
          return aS - bS || aQ - bQ;
        })
        .map(([key, val]) => {
          const display = Array.isArray(val) ? val.join(', ') : val;
          return `${key}: ${display || '(sem resposta)'}`;
        })
        .join('\n');

      const userMessage = `CLIENTE: ${client?.company_name || 'Desconhecido'}

RESPOSTAS DO FORMULÁRIO DE BRIEFING:
${answersText}

Gere o resumo estratégico completo seguindo a estrutura definida.`;

      // Chama a IA
      const { text: summaryText, modelUsed } = await runCompletion('medium', SYSTEM_PROMPT, userMessage, 4000);

      // Salva/atualiza no banco (upsert por client_id)
      const saved = await queryOne(
        `INSERT INTO client_form_summaries (client_id, tenant_id, summary, model_used)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id) DO UPDATE SET
           summary = $3, model_used = $4, updated_at = now()
         RETURNING *`,
        [clientId, tenantId, summaryText, modelUsed]
      );

      console.log('[SUCESSO][API:generate-summary] Resumo gerado', { clientId, modelUsed, length: summaryText.length });

      return res.json({
        success: true,
        summary: saved,
      });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:generate-summary]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
