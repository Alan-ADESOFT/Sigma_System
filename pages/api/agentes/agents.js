/**
 * @fileoverview Endpoint: Lista os agentes disponíveis
 * @route GET /api/agentes/agents
 *
 * Response: { success: true, data: AgentConfig[] }
 */

import { listAgentConfigs } from '../../../models/agentes/copycreator/prompts/index';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    console.log('[INFO][API:/api/agentes/agents] Listando agentes');
    const agents = listAgentConfigs();
    console.log('[SUCESSO][API:/api/agentes/agents] Agentes listados', { count: agents.length });
    return res.json({ success: true, data: agents });
  } catch (err) {
    console.error('[ERRO][API:/api/agentes/agents] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
