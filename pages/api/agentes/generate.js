/**
 * @fileoverview Endpoint: Gerar texto com agente
 * @route POST /api/agentes/generate
 *
 * Body: {
 *   agentName: string,
 *   userInput: string,
 *   modelLevel?: 'weak' | 'medium' | 'strong',
 *   customPrompt?: string,
 *   context?: Record<string, string>,
 *   complements?: {
 *     links?: string[],
 *     images?: Array<{ base64: string, mimeType: string }>,
 *     files?: Array<{ base64: string, mimeType: string, fileName: string }>
 *   }
 * }
 *
 * Response: {
 *   success: true,
 *   data: { text, citations, agentName, modelUsed, historyId, type }
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { orchestrate }     from '../../../models/agentes/copycreator/orchestrator';

// Aumenta o limite de body para suportar imagens/arquivos em base64
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);

  const {
    agentName,
    userInput,
    modelLevel,
    customPrompt,
    clientId,
    context     = {},
    complements = {},
  } = req.body;

  // Validações
  if (!agentName || typeof agentName !== 'string') {
    return res.status(400).json({ success: false, error: 'agentName é obrigatório' });
  }
  if (!userInput || typeof userInput !== 'string' || !userInput.trim()) {
    return res.status(400).json({ success: false, error: 'userInput é obrigatório' });
  }
  if (modelLevel && !['weak', 'medium', 'strong'].includes(modelLevel)) {
    return res.status(400).json({ success: false, error: 'modelLevel inválido (weak | medium | strong)' });
  }

  try {
    console.log('[INFO][API:/api/agentes/generate] Requisição recebida', { agentName, modelLevel, inputLength: userInput.length });

    // Reconstrói imagens base64 → data URLs para o Vision API
    const processedComplements = { ...complements };

    if (complements.images?.length) {
      console.log('[INFO][API:/api/agentes/generate] Processando imagens', { count: complements.images.length });
      processedComplements.images = complements.images.map(img => {
        // Se já é data URL completa, usa direto; senão monta
        if (typeof img === 'string') return img;
        return img.base64; // Frontend já envia como data URL via readAsDataURL
      });
    }

    // Reconstrói arquivos base64 → Buffers para o fileReader
    if (complements.files?.length) {
      console.log('[INFO][API:/api/agentes/generate] Processando arquivos', { count: complements.files.length });
      processedComplements.files = complements.files.map(file => {
        const base64Data = file.base64.split(',')[1] || file.base64;
        return {
          buffer: Buffer.from(base64Data, 'base64'),
          mimeType: file.mimeType,
          fileName: file.fileName,
        };
      });
    }

    const result = await orchestrate({
      agentName,
      tenantId,
      clientId:     clientId || null,
      userInput:    userInput.trim(),
      modelLevel,
      customPrompt,
      context,
      complements: processedComplements,
    });

    console.log('[SUCESSO][API:/api/agentes/generate] Resposta enviada', { agentName, historyId: result.historyId, responseLength: result.text.length });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ERRO][API:/api/agentes/generate] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
