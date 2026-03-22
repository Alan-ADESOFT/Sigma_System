/**
 * @fileoverview Endpoint: Prompt customizado de um agente
 * @route GET    /api/agentes/prompts/[agentName] -> retorna prompt atual
 * @route PUT    /api/agentes/prompts/[agentName] -> salva prompt customizado
 * @route DELETE /api/agentes/prompts/[agentName] -> remove override, volta ao padrao
 *
 * Prompts customizados sao salvos na ai_knowledge_base com:
 *   category = 'prompt_override', key = agentName, client_id = NULL (global do tenant)
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { queryOne }        from '../../../../infra/db';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { agentName } = req.query;

  if (!agentName) {
    return res.status(400).json({ success: false, error: 'agentName obrigatorio' });
  }

  // Carrega o modulo do agente para obter o prompt padrao
  let agentModule;
  try {
    const { getAgent } = require('../../../../models/agentes/copycreator/prompts/index');
    agentModule = getAgent(agentName);
    if (!agentModule) {
      return res.status(404).json({ success: false, error: 'Agente nao encontrado: ' + agentName });
    }
  } catch {
    return res.status(404).json({ success: false, error: 'Agente nao encontrado' });
  }

  try {
    // ── GET: retorna prompt atual (customizado ou padrao)
    if (req.method === 'GET') {
      const override = await queryOne(
        `SELECT value FROM ai_knowledge_base
         WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
        [tenantId, agentName]
      );

      return res.json({
        success: true,
        data: {
          prompt: override?.value || agentModule.getPrompt(),
          isCustom: !!override,
          defaultPrompt: agentModule.getPrompt(),
          agentConfig: agentModule.agentConfig,
        },
      });
    }

    // ── PUT: salva prompt customizado
    if (req.method === 'PUT') {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, error: 'prompt obrigatorio' });
      }

      await queryOne(
        `INSERT INTO ai_knowledge_base (tenant_id, category, key, value, metadata)
         VALUES ($1, 'prompt_override', $2, $3, $4)
         ON CONFLICT (tenant_id, category, key) WHERE client_id IS NULL
         DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()`,
        [tenantId, agentName, prompt.trim(), JSON.stringify({ updatedAt: new Date().toISOString() })]
      );

      console.log('[INFO][API:prompts] Prompt customizado salvo', { agentName, tenantId });
      return res.json({ success: true, isCustom: true });
    }

    // ── DELETE: remove override, volta ao padrao
    if (req.method === 'DELETE') {
      await queryOne(
        `DELETE FROM ai_knowledge_base
         WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
        [tenantId, agentName]
      );

      console.log('[INFO][API:prompts] Prompt restaurado ao padrao', { agentName, tenantId });
      return res.json({ success: true, isCustom: false });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:prompts]', { agentName, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
