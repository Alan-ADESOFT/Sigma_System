/**
 * @fileoverview Endpoint: Biblioteca de Prompts unificada
 * @route GET    /api/settings/prompt-library          → lista todas as categorias com todos os prompts
 * @route GET    /api/settings/prompt-library?id=X&category=Y → prompt individual
 * @route POST   /api/settings/prompt-library          → salva override
 * @route DELETE  /api/settings/prompt-library?id=X&category=Y → remove override
 *
 * Fontes:
 *   pipeline  → ai_knowledge_base (category='prompt_override', key=agentName, client_id IS NULL)
 *   demais    → settings (key='prompt_library_{id}')
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query, queryOne } from '../../../infra/db';
import { getSetting, setSetting, deleteSetting } from '../../../models/settings.model';

// ── Módulos de prompt ────────────────────────────────────────

const { getAgent } = require('../../../models/agentes/copycreator/prompts/index');
const { DEFAULT_GENERATE_SYSTEM, DEFAULT_MODIFY_SYSTEM } = require('../../../models/copy/copyPrompt');
const { STRUCTURE_SYSTEM } = require('../../../models/copy/structurePrompt');
const { MARKDOWN_INSTRUCTIONS } = require('../../../models/ia/markdownHelper');

// ── Mapeamento completo ──────────────────────────────────────

const PIPELINE_AGENTS = [
  { id: 'agente1',  title: 'Diagnostico do Negocio',       description: 'Analisa os dados do formulario e monta o diagnostico estrategico completo' },
  { id: 'agente2a', title: 'Pesquisa de Concorrentes',     description: 'Pesquisa concorrentes na web e coleta dados brutos' },
  { id: 'agente2b', title: 'Analise de Concorrentes',      description: 'Transforma dados brutos em analise competitiva completa' },
  { id: 'agente3',  title: 'Publico-Alvo',                 description: 'Define perfil detalhado do publico e segmentos' },
  { id: 'agente4a', title: 'Pesquisa de Avatar',           description: 'Pesquisa dores, desejos e linguagem do publico' },
  { id: 'agente4b', title: 'Construcao do Avatar',         description: 'Constroi o avatar completo com psicologia e jornada' },
  { id: 'agente5',  title: 'Posicionamento da Marca',      description: 'Define posicionamento, promessa e diferencial competitivo' },
];

const COPY_PROMPTS = [
  { id: 'copy_generate', title: 'Gerador de Copy — Criacao',      description: 'Instrui a IA a criar copies persuasivas personalizadas para o cliente', defaultPrompt: DEFAULT_GENERATE_SYSTEM },
  { id: 'copy_modify',   title: 'Gerador de Copy — Modificacao',  description: 'Instrui a IA a modificar copies existentes mantendo o texto completo',  defaultPrompt: DEFAULT_MODIFY_SYSTEM },
];

const STRUCTURE_PROMPTS = [
  { id: 'copy_structure', title: 'Criador de Estruturas', description: 'Gera estruturas de copy reutilizaveis com prompts e perguntas', defaultPrompt: STRUCTURE_SYSTEM },
];

const UTIL_PROMPTS = [
  { id: 'markdown_helper', title: 'Formatacao de Respostas', description: 'Instrui a IA a formatar outputs corretamente para o editor do sistema', defaultPrompt: MARKDOWN_INSTRUCTIONS },
];

const CATEGORIES = [
  { id: 'pipeline',    label: 'Pipeline de Agentes',    description: 'Prompts dos 7 agentes do pipeline estrategico',          icon: 'cpu' },
  { id: 'copy',        label: 'Gerador de Copy',        description: 'Prompts do gerador de copies e legendas',               icon: 'edit' },
  { id: 'structures',  label: 'Gerador de Estruturas',  description: 'Prompt para criar templates de copy reutilizaveis',      icon: 'layout' },
  { id: 'utils',       label: 'Utilitarios de IA',      description: 'Prompts auxiliares injetados automaticamente pelo sistema', icon: 'terminal' },
];

// ── Helpers ──────────────────────────────────────────────────

async function getPipelineOverrides(tenantId) {
  const rows = await query(
    `SELECT key, value, updated_at FROM ai_knowledge_base
     WHERE tenant_id = $1 AND category = 'prompt_override' AND client_id IS NULL`,
    [tenantId]
  );
  const map = {};
  for (const r of rows) map[r.key] = { value: r.value, updatedAt: r.updated_at };
  return map;
}

async function getSettingsOverrides(tenantId, ids) {
  const map = {};
  for (const id of ids) {
    const val = await getSetting(tenantId, `prompt_library_${id}`);
    if (val) map[id] = val;
  }
  return map;
}

function buildPipelinePrompts(overrides) {
  return PIPELINE_AGENTS.map(a => {
    const mod = getAgent(a.id);
    const defaultPrompt = mod ? mod.getPrompt() : '';
    const override = overrides[a.id];
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      isCustom: !!override,
      activePrompt: override ? override.value : defaultPrompt,
      defaultPrompt,
      updatedAt: override?.updatedAt || null,
    };
  });
}

function buildGenericPrompts(list, overrides) {
  return list.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    isCustom: !!overrides[p.id],
    activePrompt: overrides[p.id] || p.defaultPrompt,
    defaultPrompt: p.defaultPrompt,
    updatedAt: null,
  }));
}

// ── Handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  // ── GET ────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id, category } = req.query;

    try {
      // Prompt individual
      if (id && category) {
        if (category === 'pipeline') {
          const mod = getAgent(id);
          if (!mod) return res.status(404).json({ success: false, error: 'Agente nao encontrado' });
          const override = await queryOne(
            `SELECT value, updated_at FROM ai_knowledge_base
             WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
            [tenantId, id]
          );
          return res.json({
            success: true,
            prompt: {
              id, category,
              title: PIPELINE_AGENTS.find(a => a.id === id)?.title || id,
              description: PIPELINE_AGENTS.find(a => a.id === id)?.description || '',
              isCustom: !!override,
              activePrompt: override?.value || mod.getPrompt(),
              defaultPrompt: mod.getPrompt(),
              updatedAt: override?.updated_at || null,
            },
          });
        } else {
          const allPrompts = [...COPY_PROMPTS, ...STRUCTURE_PROMPTS, ...UTIL_PROMPTS];
          const p = allPrompts.find(x => x.id === id);
          if (!p) return res.status(404).json({ success: false, error: 'Prompt nao encontrado' });
          const override = await getSetting(tenantId, `prompt_library_${id}`);
          return res.json({
            success: true,
            prompt: {
              id, category,
              title: p.title,
              description: p.description,
              isCustom: !!override,
              activePrompt: override || p.defaultPrompt,
              defaultPrompt: p.defaultPrompt,
              updatedAt: null,
            },
          });
        }
      }

      // Lista completa
      const pipelineOverrides = await getPipelineOverrides(tenantId);
      const genericIds = [...COPY_PROMPTS, ...STRUCTURE_PROMPTS, ...UTIL_PROMPTS].map(p => p.id);
      const settingsOverrides = await getSettingsOverrides(tenantId, genericIds);

      const categories = [
        { ...CATEGORIES[0], prompts: buildPipelinePrompts(pipelineOverrides) },
        { ...CATEGORIES[1], prompts: buildGenericPrompts(COPY_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[2], prompts: buildGenericPrompts(STRUCTURE_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[3], prompts: buildGenericPrompts(UTIL_PROMPTS, settingsOverrides) },
      ];

      return res.json({ success: true, categories });
    } catch (err) {
      console.error('[ERRO][PromptLibrary] GET', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { id, category, prompt } = req.body;
    if (!id || !category || !prompt) {
      return res.status(400).json({ success: false, error: 'id, category e prompt sao obrigatorios' });
    }

    try {
      if (category === 'pipeline') {
        const metadata = JSON.stringify({ updatedAt: new Date().toISOString() });
        await query(
          `INSERT INTO ai_knowledge_base (tenant_id, client_id, category, key, value, metadata)
           VALUES ($1, NULL, 'prompt_override', $2, $3, $4)
           ON CONFLICT (tenant_id, category, key) WHERE client_id IS NULL
           DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()`,
          [tenantId, id, prompt, metadata]
        );
      } else {
        await setSetting(tenantId, `prompt_library_${id}`, prompt);
      }

      console.log('[SUCESSO][PromptLibrary] Prompt salvo', { id, category });
      return res.json({ success: true });
    } catch (err) {
      console.error('[ERRO][PromptLibrary] POST', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── DELETE ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, category } = req.query;
    if (!id || !category) {
      return res.status(400).json({ success: false, error: 'id e category sao obrigatorios' });
    }

    try {
      if (category === 'pipeline') {
        await query(
          `DELETE FROM ai_knowledge_base
           WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
          [tenantId, id]
        );
      } else {
        await deleteSetting(tenantId, `prompt_library_${id}`);
      }

      console.log('[SUCESSO][PromptLibrary] Prompt restaurado ao padrao', { id, category });
      return res.json({ success: true });
    } catch (err) {
      console.error('[ERRO][PromptLibrary] DELETE', { error: err.message });
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
}

// IMPORTANTE: Ao implementar o Sprint 2 (Análise de Prompts),
// usar POST /api/settings/prompt-library para salvar os overrides
// aceitos, garantindo consistência com a Biblioteca de Prompts.
