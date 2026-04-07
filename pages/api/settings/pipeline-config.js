/**
 * @fileoverview Endpoint: Configuração do Pipeline
 * @route GET/POST /api/settings/pipeline-config
 *
 * GET  → retorna { models, fallback, prompts }
 * POST → salva configuração por tipo:
 *   { type: 'model',          key, value }
 *   { type: 'fallback',       key, value }
 *   { type: 'prompt_override', agentName, value }
 *   { type: 'prompt_restore',  agentName }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getSetting, setSetting } from '../../../models/settings.model';
import { query, queryOne } from '../../../infra/db';
import { getOrSet, invalidate } from '../../../infra/cache';

const MODEL_KEYS = [
  'pipeline_model_weak',
  'pipeline_model_medium',
  'pipeline_model_strong',
  'pipeline_model_search',
];

const FALLBACK_KEYS = [
  'pipeline_fallback_enabled',
  'pipeline_fallback_model',
];

const ENV_DEFAULTS = {
  pipeline_model_weak:   process.env.AI_MODEL_WEAK   || 'gpt-4o-mini',
  pipeline_model_medium: process.env.AI_MODEL_MEDIUM || 'gpt-4o',
  pipeline_model_strong: process.env.AI_MODEL_STRONG || 'claude-opus-4-5',
  pipeline_model_search: process.env.AI_MODEL_SEARCH || 'gpt-4o-mini',
  pipeline_fallback_enabled: 'false',
  pipeline_fallback_model:   'gpt-4o-mini',
};

const AGENT_NAMES = ['agente1', 'agente2a', 'agente2b', 'agente3', 'agente4a', 'agente4b', 'agente5'];

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const data = await getOrSet(`settings:pipeline:${tenantId}`, async () => {
        // Modelos — queries em paralelo
        const allSettings = await query(
          `SELECT key, value FROM settings WHERE tenant_id = $1 AND key = ANY($2)`,
          [tenantId, [...MODEL_KEYS, ...FALLBACK_KEYS]]
        );
        const settingsMap = {};
        for (const row of allSettings) settingsMap[row.key] = row.value;

        const models = {};
        for (const key of MODEL_KEYS) models[key] = settingsMap[key] || ENV_DEFAULTS[key];

        const fallback = {};
        for (const key of FALLBACK_KEYS) fallback[key] = settingsMap[key] || ENV_DEFAULTS[key];

        // Prompts (overrides na KB)
        const prompts = {};
        const overrides = await query(
          `SELECT key, value FROM ai_knowledge_base
           WHERE tenant_id = $1 AND category = 'prompt_override' AND client_id IS NULL`,
          [tenantId]
        );
        for (const row of overrides) {
          prompts[row.key] = { isCustom: true, prompt: row.value };
        }

        // Prompts padrão (do arquivo) para agentes sem override
        const { getAgent } = require('../../../models/agentes/copycreator/prompts/index');
        for (const name of AGENT_NAMES) {
          if (!prompts[name]) {
            const mod = getAgent(name);
            prompts[name] = {
              isCustom: false,
              prompt: mod ? mod.getPrompt() : '',
            };
          } else {
            const mod = getAgent(name);
            prompts[name].defaultPrompt = mod ? mod.getPrompt() : '';
          }
        }

        return { models, fallback, prompts };
      }, 300);

      return res.json({ success: true, data });
    } catch (err) {
      console.error('[ERRO][API:pipeline-config] GET', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { type, key, value, agentName } = req.body;

    try {
      if (type === 'model') {
        if (!MODEL_KEYS.includes(key)) {
          return res.status(400).json({ success: false, error: 'Chave de modelo invalida' });
        }
        await setSetting(tenantId, key, value);
        invalidate(`settings:pipeline:${tenantId}`);
        console.log('[SUCESSO][API:pipeline-config] Modelo salvo', { key, value });
        return res.json({ success: true });
      }

      if (type === 'fallback') {
        if (!FALLBACK_KEYS.includes(key)) {
          return res.status(400).json({ success: false, error: 'Chave de fallback invalida' });
        }
        await setSetting(tenantId, key, value);
        invalidate(`settings:pipeline:${tenantId}`);
        console.log('[SUCESSO][API:pipeline-config] Fallback salvo', { key, value });
        return res.json({ success: true });
      }

      if (type === 'prompt_override') {
        if (!AGENT_NAMES.includes(agentName)) {
          return res.status(400).json({ success: false, error: 'Agente invalido' });
        }
        const metadata = JSON.stringify({ updatedAt: new Date().toISOString() });
        await query(
          `INSERT INTO ai_knowledge_base (tenant_id, client_id, category, key, value, metadata)
           VALUES ($1, NULL, 'prompt_override', $2, $3, $4)
           ON CONFLICT (tenant_id, category, key) WHERE client_id IS NULL
           DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()`,
          [tenantId, agentName, value, metadata]
        );
        invalidate(`settings:pipeline:${tenantId}`);
        console.log('[SUCESSO][API:pipeline-config] Prompt override salvo', { agentName });
        return res.json({ success: true });
      }

      if (type === 'prompt_restore') {
        if (!AGENT_NAMES.includes(agentName)) {
          return res.status(400).json({ success: false, error: 'Agente invalido' });
        }
        await query(
          `DELETE FROM ai_knowledge_base
           WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
          [tenantId, agentName]
        );
        invalidate(`settings:pipeline:${tenantId}`);
        console.log('[SUCESSO][API:pipeline-config] Prompt restaurado ao padrao', { agentName });
        return res.json({ success: true });
      }

      return res.status(400).json({ success: false, error: 'Tipo de operacao invalido' });
    } catch (err) {
      console.error('[ERRO][API:pipeline-config] POST', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
}
