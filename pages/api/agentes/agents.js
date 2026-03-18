/**
 * @fileoverview Endpoint: Lista os agentes disponíveis
 * @route GET /api/agentes/agents                    → lista todos os agentes
 * @route GET /api/agentes/agents?name=X&prompt=true → retorna prompt de um agente
 *
 * Response: { success: true, data: AgentConfig[] | { prompt: string } }
 */

import { listAgentConfigs, getAgent } from '../../../models/agentes/copycreator/prompts/index';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { name, prompt } = req.query;

    // Se pedir o prompt de um agente específico
    if (name && prompt === 'true') {
      console.log('[INFO][API:/api/agentes/agents] Buscando prompt do agente', { name });
      const agent = getAgent(name);
      if (!agent) return res.status(404).json({ success: false, error: 'Agente não encontrado' });
      const promptText = agent.getPrompt();
      console.log('[SUCESSO][API:/api/agentes/agents] Prompt retornado', { name, length: promptText.length });
      return res.json({ success: true, data: { prompt: promptText, config: agent.agentConfig } });
    }

    // Lista todos
    console.log('[INFO][API:/api/agentes/agents] Listando agentes');
    const agents = listAgentConfigs();
    console.log('[SUCESSO][API:/api/agentes/agents] Agentes listados', { count: agents.length });
    return res.json({ success: true, data: agents });
  } catch (err) {
    console.error('[ERRO][API:/api/agentes/agents] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
