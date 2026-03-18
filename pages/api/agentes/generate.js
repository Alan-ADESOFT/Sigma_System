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
 *   complements?: { links: string[], images: string[] }
 * }
 *
 * Response: {
 *   success: true,
 *   data: { text, citations, agentName, modelUsed, historyId, type }
 * }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { orchestrate }     from '../../../models/agentes/copycreator/orchestrator';

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

    const result = await orchestrate({
      agentName,
      tenantId,
      userInput:    userInput.trim(),
      modelLevel,
      customPrompt,
      context,
      complements,
    });

    console.log('[SUCESSO][API:/api/agentes/generate] Resposta enviada', { agentName, historyId: result.historyId, responseLength: result.text.length });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ERRO][API:/api/agentes/generate] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
