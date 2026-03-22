/**
 * @fileoverview Endpoint: Gerar copy com IA
 * @route POST /api/copy/generate
 *
 * Body: {
 *   sessionId: string,
 *   contentId: string,
 *   clientId?: string,
 *   structureId?: string,
 *   modelOverride?: string,
 *   promptRaiz: string,
 *   tone?: string,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 *
 * Monta system prompt com: estrutura + KB do cliente + dados do cliente.
 * Chama runCompletion, salva na sessao e no historico.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';
import { runCompletion, resolveModel } from '../../../models/ia/completion';
import { withMarkdown } from '../../../models/ia/markdownHelper';
import { updateSession, saveToHistory } from '../../../models/copy/copySession';
import { extractFromFile } from '../../../infra/api/fileReader';
import { buildGenerateSystem, buildGenerateUserMessage, formatCopyOutput } from '../../../models/copy/copyPrompt';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

// Categorias da KB que compoem a base estrategica do cliente
const KB_CATEGORIES = ['diagnostico', 'concorrentes', 'publico_alvo', 'avatar', 'posicionamento', 'oferta'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const {
    sessionId, contentId, clientId, structureId,
    modelOverride, promptRaiz, tone, images, files,
  } = req.body;

  if (!sessionId || !promptRaiz) {
    return res.status(400).json({ success: false, error: 'sessionId e promptRaiz sao obrigatorios' });
  }

  try {
    console.log('[INFO][API:copy/generate] Gerando copy', { sessionId, clientId, structureId });

    // 1. Carrega estrutura (se selecionada)
    let structureName = '';
    let structurePromptBase = '';
    if (structureId) {
      const structure = await queryOne(
        'SELECT name, prompt_base FROM copy_structures WHERE id = $1 AND tenant_id = $2',
        [structureId, tenantId]
      );
      if (structure) {
        structureName = structure.name;
        structurePromptBase = structure.prompt_base;
      }
    }

    // 2. Carrega KB do cliente (base estrategica)
    let kbContext = '';
    let clientSummary = '';
    if (clientId) {
      const client = await queryOne(
        'SELECT company_name, niche, main_product, avg_ticket, main_problem, region FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
        [clientId, tenantId]
      );
      if (client) {
        clientSummary = `\nRESUMO DO CLIENTE:\nEmpresa: ${client.company_name || 'N/A'}\nNicho: ${client.niche || 'N/A'}\nProduto principal: ${client.main_product || 'N/A'}\nTicket medio: ${client.avg_ticket || 'N/A'}\nPrincipal problema: ${client.main_problem || 'N/A'}\nRegiao: ${client.region || 'N/A'}`;
      }

      // Busca KB do cliente
      const kbRows = await query(
        `SELECT category, key, value FROM ai_knowledge_base
         WHERE tenant_id = $1 AND client_id = $2 AND category = ANY($3)
         ORDER BY category, key`,
        [tenantId, clientId, KB_CATEGORIES]
      );

      if (kbRows.length > 0) {
        const kbParts = [];
        let currentCat = '';
        for (const row of kbRows) {
          if (row.category !== currentCat) {
            currentCat = row.category;
            kbParts.push(`\n--- ${currentCat.toUpperCase()} ---`);
          }
          // Limita cada entrada a 3000 chars para nao estourar contexto
          kbParts.push(row.value.substring(0, 3000));
        }
        kbContext = `\nBASE DE DADOS DO CLIENTE:\n${kbParts.join('\n')}`;
      }
    }

    // 3. Processa arquivos anexados
    let filesContent = '';
    if (files?.length) {
      console.log('[INFO][API:copy/generate] Processando arquivos', { count: files.length });
      const fileTexts = [];
      for (const file of files) {
        const base64Data = file.base64.split(',')[1] || file.base64;
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await extractFromFile(buffer, file.mimeType, file.fileName);
        if (result.success && result.text) {
          fileTexts.push(`[${file.fileName}]\n${result.text.substring(0, 3000)}`);
        }
      }
      if (fileTexts.length) filesContent = fileTexts.join('\n---\n');
    }

    // 4. Processa imagens
    let imagesDescription = '';
    if (images?.length) {
      console.log('[INFO][API:copy/generate] Processando imagens', { count: images.length });
      const { analyzeMultipleImages } = require('../../../infra/api/vision');
      const imageUrls = images.map(img => img.base64);
      const visionResult = await analyzeMultipleImages(
        imageUrls,
        'Descreva as imagens para uso em copywriting de marketing.',
        { detail: 'high' }
      );
      if (visionResult.analysis) imagesDescription = visionResult.analysis;
    }

    // 5. Monta system prompt via copyPrompt model
    let systemPrompt = buildGenerateSystem({
      clientSummary, kbContext,
      structureName, structurePrompt: structurePromptBase,
      tone, imagesDescription, filesContent,
    });
    systemPrompt = withMarkdown(systemPrompt);

    // 6. Monta user message
    // Se tem estrutura → texto do usuario = pedidos extras do operador
    // Se nao tem → texto do usuario = instrucao principal
    const userMessage = buildGenerateUserMessage(promptRaiz, !!structurePromptBase);

    // 7. Chama IA
    const model = modelOverride || resolveModel('medium');
    const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';

    let text, usage;
    if (modelOverride) {
      // Chama diretamente com model override
      const apiModule = provider === 'Anthropic'
        ? require('../../../infra/api/anthropic')
        : require('../../../infra/api/openai');
      const result = await apiModule.generateCompletion(model, systemPrompt, userMessage, 4000);
      text = result.text;
      usage = result.usage;

      // Log de tokens manual
      const { logUsage } = require('../../../models/copy/tokenUsage');
      logUsage({
        tenantId, modelUsed: model, provider: provider.toLowerCase(),
        operationType: 'copy_generate', clientId, sessionId,
        tokensInput: usage.input, tokensOutput: usage.output,
      });
    } else {
      const result = await runCompletion('medium', systemPrompt, userMessage, 4000, {
        tenantId, clientId, sessionId, operationType: 'copy_generate',
      });
      text = result.text;
      usage = result.usage;
    }

    // 8. Formatacao via IA (pos-geracao)
    text = await formatCopyOutput(text);

    // 9. Salva na sessao
    await updateSession(sessionId, {
      client_id: clientId || null,
      structure_id: structureId || null,
      model_used: model,
      prompt_raiz: promptRaiz,
      output_text: text,
      tone: tone || null,
      status: 'draft',
    });

    // 9. Salva no historico
    const historyEntry = await saveToHistory(
      sessionId, tenantId, model, systemPrompt.substring(0, 2000),
      text, 'generate', usage || {}
    );

    console.log('[SUCESSO][API:copy/generate] Copy gerada', {
      sessionId, model, responseLength: text.length, historyId: historyEntry.id,
    });

    return res.json({
      success: true,
      data: { text, historyId: historyEntry.id },
      usage: usage || null,
    });

  } catch (err) {
    console.error('[ERRO][API:copy/generate]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
