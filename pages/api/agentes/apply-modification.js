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
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { queryOne }        from '../../../infra/db';
import { runCompletion }   from '../../../models/ia/completion';
import { extractFromFile } from '../../../infra/api/fileReader';

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
  const { clientId, stageKey, operatorPrompt, currentOutput, images, files } = req.body;

  if (!clientId || !stageKey || !operatorPrompt) {
    return res.status(400).json({ success: false, error: 'clientId, stageKey e operatorPrompt são obrigatórios' });
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

RESUMO DO CLIENTE:
Empresa: ${client.company_name || 'N/A'}
Nicho: ${client.niche || 'N/A'}
Produto principal: ${client.main_product || 'N/A'}
Ticket médio: ${client.avg_ticket || 'N/A'}
Principal problema: ${client.main_problem || 'N/A'}
Região: ${client.region || 'N/A'}${formSummary}

OUTPUT ATUAL DA ETAPA (o operador vai pedir modificações neste texto):
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
        systemPrompt += `\n\nARQUIVOS ANEXADOS PELO OPERADOR:\n${fileTexts.join('\n---\n')}`;
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
        systemPrompt += `\n\nANÁLISE DAS IMAGENS ANEXADAS:\n${visionResult.analysis}`;
      }
    }

    console.log('[INFO][ApplyModification] Executando modificação', { clientId, stageKey, promptLength: operatorPrompt.length });

    const result = await runCompletion('medium', systemPrompt, operatorPrompt, 4000);

    // Salva no histórico
    await queryOne(
      `INSERT INTO ai_agent_history (tenant_id, agent_name, model_used, prompt_sent, response_text, metadata, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, `modification_${stageKey}`, result.modelUsed, systemPrompt.substring(0, 2000), result.text,
       JSON.stringify({ stageKey, operatorPrompt, type: 'modification' }), clientId]
    );

    console.log('[SUCESSO][ApplyModification] Modificação aplicada', { stageKey, responseLength: result.text.length });
    return res.json({ success: true, data: { text: result.text } });

  } catch (err) {
    console.error('[ERRO][ApplyModification]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
