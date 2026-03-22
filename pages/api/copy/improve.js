/**
 * @fileoverview Endpoint: Modificar/melhorar copy existente
 * @route POST /api/copy/improve
 *
 * Body: {
 *   sessionId: string,
 *   currentOutput: string,
 *   instruction: string,
 *   clientId?: string,
 *   modelOverride?: string,
 *   images?: Array<{ base64, mimeType }>,
 *   files?: Array<{ base64, mimeType, fileName }>
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { queryOne } from '../../../infra/db';
import { runCompletion, resolveModel } from '../../../models/ia/completion';
import { withMarkdown } from '../../../models/ia/markdownHelper';
import { updateSession, saveToHistory } from '../../../models/copy/copySession';
import { extractFromFile } from '../../../infra/api/fileReader';
import { buildModifySystem, formatCopyOutput } from '../../../models/copy/copyPrompt';

export const config = {
  api: { bodyParser: { sizeLimit: '30mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { sessionId, currentOutput, instruction, clientId, modelOverride, images, files } = req.body;

  if (!sessionId || !instruction) {
    return res.status(400).json({ success: false, error: 'sessionId e instruction sao obrigatorios' });
  }

  try {
    console.log('[INFO][API:copy/improve] Melhorando copy', { sessionId, clientId });

    // Contexto do cliente (resumido)
    let clientContext = '';
    if (clientId) {
      const client = await queryOne(
        'SELECT company_name, niche, main_product FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
        [clientId, tenantId]
      );
      if (client) {
        clientContext = `Cliente: ${client.company_name} | Nicho: ${client.niche || 'N/A'} | Produto: ${client.main_product || 'N/A'}`;
      }
    }

    // Processa arquivos
    let filesContent = '';
    if (files?.length) {
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

    // Processa imagens
    let imagesDescription = '';
    if (images?.length) {
      const { analyzeMultipleImages } = require('../../../infra/api/vision');
      const imageUrls = images.map(img => img.base64);
      const visionResult = await analyzeMultipleImages(
        imageUrls,
        'Descreva as imagens para uso em copywriting.',
        { detail: 'high' }
      );
      if (visionResult.analysis) imagesDescription = visionResult.analysis;
    }

    // System prompt via copyPrompt model
    let systemPrompt = buildModifySystem({
      currentOutput, clientContext, imagesDescription, filesContent,
    });
    systemPrompt = withMarkdown(systemPrompt);

    // Chama IA
    const result = await runCompletion('medium', systemPrompt, instruction, 4000, {
      tenantId, clientId, sessionId, operationType: 'copy_modify',
    });

    // Formatacao via IA (pos-geracao)
    result.text = await formatCopyOutput(result.text);

    // Salva na sessao
    await updateSession(sessionId, { output_text: result.text });

    // Salva no historico
    const historyEntry = await saveToHistory(
      sessionId, tenantId, result.modelUsed, systemPrompt.substring(0, 2000),
      result.text, 'modify', result.usage || {}
    );

    console.log('[SUCESSO][API:copy/improve] Copy modificada', {
      sessionId, responseLength: result.text.length, historyId: historyEntry.id,
    });

    return res.json({
      success: true,
      data: { text: result.text, historyId: historyEntry.id },
      usage: result.usage || null,
    });

  } catch (err) {
    console.error('[ERRO][API:copy/improve]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
