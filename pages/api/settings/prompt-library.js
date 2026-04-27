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
const { DEFAULT_SYSTEM_PT, DEFAULT_SYSTEM_EN } = require('../../../models/jarvis/systemPrompt');
const { DEFAULT_LEAD_ANALYSIS_SYSTEM }       = require('../../../models/comercial/prompts/leadAnalysis');
const { DEFAULT_PROPOSAL_DIAGNOSTIC_SYSTEM } = require('../../../models/comercial/prompts/proposalDiagnostic');
const { DEFAULT_PROPOSAL_OPPORTUNITY_SYSTEM }= require('../../../models/comercial/prompts/proposalOpportunity');
const { DEFAULT_PROPOSAL_PILLARS_SYSTEM }    = require('../../../models/comercial/prompts/proposalPillars');
const { DEFAULT_PROPOSAL_PROJECTION_SYSTEM } = require('../../../models/comercial/prompts/proposalProjection');
const { DEFAULT_CALL_SCRIPT_SYSTEM }         = require('../../../models/comercial/prompts/callScript');
const {
  DEFAULT_DIAGNOSIS_PROMPT: ADS_DEFAULT_DIAGNOSIS,
  DEFAULT_WEEKLY_REPORT_PROMPT: ADS_DEFAULT_WEEKLY,
  DEFAULT_ANOMALY_EXPLANATION_PROMPT: ADS_DEFAULT_ANOMALY,
} = require('../../../models/ads/adsPrompts');

// ── Gerador de Imagem ────────────────────────────────────────
const { PROMPT_ENGINEER_SYSTEM }       = require('../../../models/agentes/imagecreator/prompts/promptEngineer');
const { BRANDBOOK_EXTRACT_SYSTEM }     = require('../../../models/agentes/imagecreator/prompts/brandbookExtract');
const { BRANDBOOK_FROM_TEXT_SYSTEM }   = require('../../../models/agentes/imagecreator/prompts/brandbookFromText');
// Sprint v1.1 — abril 2026: novos prompts editáveis
const { SMART_SELECTOR_SYSTEM }        = require('../../../models/agentes/imagecreator/prompts/smartSelector');
const {
  INSPIRATION_INSTRUCTION,
  CHARACTER_INSTRUCTION,
  SCENE_INSTRUCTION,
  FIXED_REF_INSTRUCTION,
} = require('../../../models/agentes/imagecreator/referenceVision');

const TITLE_GEN_DEFAULT = 'Você gera títulos curtos para imagens. Devolva APENAS um título de 3-5 palavras em português, sem aspas, sem pontuação final, sem explicações.';

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

const JARVIS_PROMPTS = [
  { id: 'jarvis_system_pt', title: 'J.A.R.V.I.S — System Prompt (PT-BR)', description: 'Prompt de sistema do assistente de voz em portugues. Placeholders: {TENANT_NAME}, {USER_NAME}, {CURRENT_DATE}', defaultPrompt: DEFAULT_SYSTEM_PT },
  { id: 'jarvis_system_en', title: 'J.A.R.V.I.S — System Prompt (EN)',    description: 'Prompt de sistema do assistente de voz em ingles. Placeholders: {TENANT_NAME}, {USER_NAME}, {CURRENT_DATE}',    defaultPrompt: DEFAULT_SYSTEM_EN },
];

const COMERCIAL_PROMPTS = [
  { id: 'comercial_lead_analysis',        title: 'Comercial — Análise de Lead',          description: 'Análise IA de leads do pipeline comercial (positivos, negativos, ataque, abordagem, score). Placeholders: {LEAD_CONTEXT}, {COLLECTED_DATA}', defaultPrompt: DEFAULT_LEAD_ANALYSIS_SYSTEM },
  { id: 'comercial_proposal_diagnostic',  title: 'Comercial — Diagnóstico da Proposta',  description: 'Gera os 3 parágrafos do diagnóstico da proposta personalizada. Placeholders: {LEAD_CONTEXT}, {LEAD_ANALYSIS}',                                       defaultPrompt: DEFAULT_PROPOSAL_DIAGNOSTIC_SYSTEM },
  { id: 'comercial_proposal_opportunity', title: 'Comercial — Oportunidade da Proposta', description: 'Gera a seção de oportunidade conectando gap → ação Sigma → resultado. Placeholders: {LEAD_CONTEXT}, {LEAD_ANALYSIS}, {DIAGNOSTIC_TEXT}',          defaultPrompt: DEFAULT_PROPOSAL_OPPORTUNITY_SYSTEM },
  { id: 'comercial_proposal_pillars',     title: 'Comercial — Pilares da Proposta',      description: 'Gera os 3 pilares (Estratégia, Conteúdo, Tráfego) personalizados em JSON. Placeholders: {LEAD_CONTEXT}, {LEAD_ANALYSIS}',                            defaultPrompt: DEFAULT_PROPOSAL_PILLARS_SYSTEM },
  { id: 'comercial_proposal_projection',  title: 'Comercial — Projeção da Proposta',     description: 'Gera os 4 cards de stats da seção de projeção em JSON. Placeholder: {LEAD_CONTEXT}',                                                                defaultPrompt: DEFAULT_PROPOSAL_PROJECTION_SYSTEM },
  { id: 'comercial_call_script',          title: 'Comercial — Script de Cold Call',      description: 'Gera roteiro de ligação fria (abertura + âncora + bridge + CTA + objeções). Variantes: consultive/direct/curious. Placeholders: {LEAD_CONTEXT}, {LEAD_ANALYSIS}, {VARIANT}', defaultPrompt: DEFAULT_CALL_SCRIPT_SYSTEM },
];

const ADS_PROMPTS = [
  { id: 'ads_insights_diagnosis',   title: 'Ads — Diagnóstico (Framework)',     description: 'Aplica o fluxograma de decisão de tráfego pago sobre dados reais e gera diagnóstico + recomendações. Recebe KPIs, comparação e timeline diário.', defaultPrompt: ADS_DEFAULT_DIAGNOSIS },
  { id: 'ads_weekly_report',        title: 'Ads — Relatório Semanal',           description: 'Relatório executivo automático gerado toda segunda-feira com KPIs da semana, top/bottom 3 e recomendações.',                                       defaultPrompt: ADS_DEFAULT_WEEKLY },
  { id: 'ads_anomaly_explanation',  title: 'Ads — Explicação de Anomalia',      description: 'Explica em até 3 frases uma anomalia detectada automaticamente (CPA spike, ROAS drop, etc.) e a ação imediata recomendada.',                       defaultPrompt: ADS_DEFAULT_ANOMALY },
];

const IMAGE_PROMPTS = [
  { id: 'image_prompt_engineer',     title: 'Imagem — Otimizador de Prompt',          description: 'Transforma a descrição bruta em um prompt visual profissional, adaptando o estilo ao modelo de destino (Nano Banana 2 / Flux Kontext / GPT Image 2 / Imagen 3 Cap / Imagen 4). Injeta brandbook + fixed refs + descrições de refs por modo.', defaultPrompt: PROMPT_ENGINEER_SYSTEM },
  { id: 'image_brandbook_extract',   title: 'Imagem — Extrator de Brandbook',          description: 'Estrutura texto bruto de PDF/HTML em JSON do brandbook (paleta, tipografia, tom, do/dont, refs).',                                                                       defaultPrompt: BRANDBOOK_EXTRACT_SYSTEM },
  { id: 'image_brandbook_generate',  title: 'Imagem — Gerador de Brandbook por IA',    description: 'Cria brandbook estruturado a partir de descrição em texto livre da marca (com inferências coerentes).',                                                                  defaultPrompt: BRANDBOOK_FROM_TEXT_SYSTEM },
  // Sprint v1.1 — abril 2026: novos prompts editáveis
  { id: 'image_smart_selector',      title: 'Imagem — Auto-seletor de Modelo',         description: 'Decide qual modelo usar para cada tarefa quando Smart Mode está ativo. Roda em ~$0.0005 por geração.',                                                                  defaultPrompt: SMART_SELECTOR_SYSTEM },
  { id: 'image_title_generator',     title: 'Imagem — Gerador de Títulos',             description: 'Cria títulos curtos (3-5 palavras) para imagens geradas, exibidos nos cards.',                                                                                            defaultPrompt: TITLE_GEN_DEFAULT },
  { id: 'image_reference_inspiration', title: 'Imagem — Vision (modo Inspiração)',     description: 'Descreve estilo visual de imagens de referência pra reuso de paleta/mood/composição (não descreve sujeitos específicos).',                                              defaultPrompt: INSPIRATION_INSTRUCTION },
  { id: 'image_reference_character', title: 'Imagem — Vision (modo Personagem)',       description: 'Descreve sujeito da imagem traço por traço para que o gerador preserve a pessoa exata no resultado.',                                                                  defaultPrompt: CHARACTER_INSTRUCTION },
  { id: 'image_reference_scene',     title: 'Imagem — Vision (modo Cenário)',          description: 'Descreve ambiente/cenário da imagem para usar como background na nova geração.',                                                                                       defaultPrompt: SCENE_INSTRUCTION },
  { id: 'image_brandbook_fixed_ref', title: 'Imagem — Vision (Fixed Brand Ref)',       description: 'Descreve as referências fixas do brandbook que SEMPRE são injetadas em toda geração. Cache 30 dias por imagem.',                                                       defaultPrompt: FIXED_REF_INSTRUCTION },
];

const CATEGORIES = [
  { id: 'pipeline',         label: 'Pipeline de Agentes',     description: 'Prompts dos 7 agentes do pipeline estrategico',            icon: 'cpu' },
  { id: 'copy',             label: 'Gerador de Copy',         description: 'Prompts do gerador de copies e legendas',                 icon: 'edit' },
  { id: 'structures',       label: 'Gerador de Estruturas',   description: 'Prompt para criar templates de copy reutilizaveis',        icon: 'layout' },
  { id: 'jarvis',           label: 'J.A.R.V.I.S',            description: 'Prompts de sistema do assistente de voz',                  icon: 'bot' },
  { id: 'utils',            label: 'Utilitarios de IA',       description: 'Prompts auxiliares injetados automaticamente pelo sistema', icon: 'terminal' },
  { id: 'comercial',        label: 'Módulo Comercial',         description: 'Prompts da análise de leads e geração de propostas',       icon: 'briefcase' },
  { id: 'ads',              label: 'Ads (Meta)',               description: 'Prompts de diagnóstico, relatório semanal e anomalias do módulo Ads', icon: 'megaphone' },
  { id: 'image',            label: 'Gerador de Imagem',        description: 'Prompts do otimizador de prompt e do extrator/gerador de brandbook',  icon: 'image' },
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
          const allPrompts = [...COPY_PROMPTS, ...STRUCTURE_PROMPTS, ...JARVIS_PROMPTS, ...UTIL_PROMPTS, ...COMERCIAL_PROMPTS, ...ADS_PROMPTS, ...IMAGE_PROMPTS];
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
      const genericIds = [
        ...COPY_PROMPTS, ...STRUCTURE_PROMPTS, ...JARVIS_PROMPTS, ...UTIL_PROMPTS,
        ...COMERCIAL_PROMPTS, ...ADS_PROMPTS, ...IMAGE_PROMPTS,
      ].map(p => p.id);
      const settingsOverrides = await getSettingsOverrides(tenantId, genericIds);

      const categories = [
        { ...CATEGORIES[0], prompts: buildPipelinePrompts(pipelineOverrides) },
        { ...CATEGORIES[1], prompts: buildGenericPrompts(COPY_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[2], prompts: buildGenericPrompts(STRUCTURE_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[3], prompts: buildGenericPrompts(JARVIS_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[4], prompts: buildGenericPrompts(UTIL_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[5], prompts: buildGenericPrompts(COMERCIAL_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[6], prompts: buildGenericPrompts(ADS_PROMPTS, settingsOverrides) },
        { ...CATEGORIES[7], prompts: buildGenericPrompts(IMAGE_PROMPTS, settingsOverrides) },
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
