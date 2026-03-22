/**
 * @fileoverview Endpoint: Aplicar modificação via IA no output de uma etapa
 * @route POST /api/agentes/apply-modification
 *
 * Recebe o output atual + prompt do operador, e retorna o output modificado.
 * Modelo fixo: medium (GPT-4o). Contexto do cliente montado no backend.
 *
 * Body: {
 *   clientId: string,
 *   stageKey: string,
 *   operatorPrompt: string,
 *   currentOutput: string,
 *   chatHistory?: Array<{ role: 'user'|'assistant', content: string }>,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 */

import { resolveTenantId }  from '../../../infra/get-tenant-id';
import { queryOne }         from '../../../infra/db';
import { resolveModel }    from '../../../models/ia/completion';
import { withMarkdown }    from '../../../models/ia/markdownHelper';
import { extractFromFile } from '../../../infra/api/fileReader';
import { checkRateLimit, logRateLimitEvent } from '../../../infra/rateLimit';

const STAGE_LABELS = {
  diagnosis:   'Diagnóstico do Negócio',
  competitors: 'Análise de Concorrentes',
  audience:    'Público-Alvo',
  avatar:      'Construção do Avatar',
  positioning: 'Posicionamento da Marca',
  offer:       'Definição da Oferta',
};

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { clientId, stageKey, operatorPrompt, currentOutput, chatHistory, images, files } = req.body;

  if (!clientId || !stageKey || !operatorPrompt) {
    return res.status(400).json({ success: false, error: 'clientId, stageKey e operatorPrompt são obrigatórios' });
  }

  // Rate limit: 50 modificacoes por dia (1440 min) por tenant
  const rateCheck = await checkRateLimit(tenantId, 'modification', 50, 1440);
  if (!rateCheck.ok) {
    console.log('[WARN][Modification] Rate limit atingido', { tenantId, count: rateCheck.count });
    return res.status(429).json({
      success: false,
      error: `Limite diario de modificacoes atingido (${rateCheck.count}/50). Tente novamente amanha.`,
      remaining: rateCheck.remaining,
      retryAfter: rateCheck.resetIn,
    });
  }

  try {
    // Busca dados do cliente para contexto
    const client = await queryOne(
      'SELECT company_name, niche, main_product, avg_ticket, main_problem, region, product_description, transformation, form_done FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Busca dados do form se disponível
    let formSummary = '';
    if (client.form_done) {
      const form = await queryOne(
        `SELECT data FROM client_form_responses WHERE client_id = $1 AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1`,
        [clientId]
      );
      if (form?.data) {
        // Extrai campos-chave do form para contexto resumido
        const d = form.data;
        const formFields = [
          d['1.1'] && `Empresa: ${d['1.1']}`,
          d['1.2'] && `Nicho: ${d['1.2']}`,
          d['1.4'] && `Região: ${d['1.4']}`,
          d['1.9'] && `Ticket médio: ${d['1.9']}`,
          d['2.1'] && `Produtos: ${d['2.1']}`,
          d['4.1'] && `Principal problema: ${d['4.1']}`,
        ].filter(Boolean).join('\n');
        if (formFields) formSummary = `\n\nDADOS DO FORMULÁRIO:\n${formFields}`;
      }
    }

    const stageLabel = STAGE_LABELS[stageKey] || stageKey;

    // Monta system prompt com contexto invisível
    let systemPrompt = `Você é um assistente de marketing estratégico da agência Sigma.
Você está trabalhando na etapa "${stageLabel}" do cliente "${client.company_name}".

REGRAS DE RESPOSTA:
1. SEMPRE retorne o TEXTO COMPLETO da etapa, nao apenas o trecho modificado.
2. Se pedir para adicionar: retorne TODO o texto + trecho novo no local pedido.
3. Se pedir para trocar: retorne TODO o texto com a parte trocada.
4. Se pedir para remover: retorne TODO o texto sem a parte removida.
5. NUNCA retorne apenas a modificacao isolada. SEMPRE o documento inteiro.
6. Mantenha a formatacao, estrutura, titulos e secoes do texto original.

FORMATACAO OBRIGATORIA:
- Use ## para titulos de secao e ### para subtitulos
- Use **negrito** para termos importantes e conclusoes
- Use *italico* para enfase suave
- Use - para listas de topicos
- Paragrafos curtos (2-4 linhas) com linha em branco entre eles
- NAO use blocos de codigo, tabelas, HTML ou > citacoes

RESUMO DO CLIENTE:
Empresa: ${client.company_name || 'N/A'}
Nicho: ${client.niche || 'N/A'}
Produto principal: ${client.main_product || 'N/A'}
Ticket médio: ${client.avg_ticket || 'N/A'}
Principal problema: ${client.main_problem || 'N/A'}
Região: ${client.region || 'N/A'}${formSummary}

TEXTO ATUAL DA ETAPA (aplique as modificações pedidas SOBRE este texto e retorne ele completo):
${currentOutput || '(vazio)'}`;

    // Se tem arquivos, extrai texto e injeta no contexto
    if (files?.length) {
      console.log('[INFO][ApplyModification] Processando arquivos', { count: files.length });
      const fileTexts = [];
      for (const file of files) {
        const base64Data = file.base64.split(',')[1] || file.base64;
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await extractFromFile(buffer, file.mimeType, file.fileName);
        if (result.success && result.text) {
          fileTexts.push(`[${file.fileName}]\n${result.text}`);
        }
      }
      if (fileTexts.length) {
        systemPrompt += `\n\nDOCUMENTOS ANEXADOS (${fileTexts.length} arquivo(s) — texto extraido automaticamente, use esses dados quando o operador mencionar arquivos/documentos):\n${fileTexts.join('\n---\n')}`;
      }
    }

    // Se tem imagens, usa Vision (GPT-4o com imagens)
    if (images?.length) {
      console.log('[INFO][ApplyModification] Usando Vision para imagens', { count: images.length });
      const { analyzeMultipleImages } = require('../../../infra/api/vision');
      const imageUrls = images.map(img => img.base64);
      const visionResult = await analyzeMultipleImages(
        imageUrls,
        'Descreva as imagens fornecidas de forma objetiva para uso em estratégia de marketing.',
        { detail: 'high' }
      );
      if (visionResult.analysis) {
        systemPrompt += `\n\nIMAGENS ANEXADAS (${images.length} imagem(ns) — descricao gerada automaticamente, use esses dados quando o operador mencionar imagens):\n${visionResult.analysis}`;
      }
    }

    // Aplica instrucoes de formatacao markdown
    systemPrompt = withMarkdown(systemPrompt);

    console.log('[INFO][ApplyModification] Executando modificacao', { clientId, stageKey, promptLength: operatorPrompt.length, historyLength: chatHistory?.length || 0 });

    // Monta mensagens multi-turn (chat com historico)
    const model = resolveModel('medium');
    const messages = [{ role: 'system', content: systemPrompt }];

    // Injeta histórico de conversa (últimas modificações)
    if (chatHistory?.length) {
      for (const msg of chatHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Mensagem atual do operador
    messages.push({ role: 'user', content: operatorPrompt });

    // Chama OpenAI diretamente com mensagens multi-turn
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não configurada');

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 4000 }),
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.json().catch(() => ({}));
      throw new Error(`OpenAI Error ${aiResponse.status}: ${err?.error?.message || aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const resultText = aiData.choices?.[0]?.message?.content || '';

    // Salva no histórico
    await queryOne(
      `INSERT INTO ai_agent_history (tenant_id, agent_name, model_used, prompt_sent, response_text, metadata, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, `modification_${stageKey}`, model, systemPrompt.substring(0, 2000), resultText,
       JSON.stringify({ stageKey, operatorPrompt, type: 'modification' }), clientId]
    );

    // Registra evento de rate limit
    await logRateLimitEvent(tenantId, 'modification', { clientId, stageKey });

    console.log('[SUCESSO][ApplyModification] Modificação aplicada', { stageKey, responseLength: resultText.length });
    return res.json({ success: true, data: { text: resultText } });

  } catch (err) {
    console.error('[ERRO][ApplyModification]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
