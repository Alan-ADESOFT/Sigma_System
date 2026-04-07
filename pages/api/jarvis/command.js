/**
 * @fileoverview POST /api/jarvis/command
 *
 * Recebe { text?, audioBase64?, language? } e:
 *   1. Resolve tenant + user (cookie)
 *   2. Verifica quota diária (admin=40, user=10 — configurável)
 *   3. Se audioBase64, transcreve via Whisper
 *   4. Carrega config + funções habilitadas
 *   5. Envia mensagem para o modelo (OpenAI ou Anthropic) com tools filtradas
 *   6. Se a IA chamar uma tool, executa via models/jarvis/commands.js
 *   7. Loga uso e retorna { response, command, data, requiresConfirmation }
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { queryOne } from '../../../infra/db';
import { getJarvisConfig } from '../../../models/jarvis/config';
import { checkJarvisQuota, logJarvisUsage } from '../../../models/jarvis/rateLimit';
import { getToolDefinitions } from '../../../models/jarvis/tools';
import { executeCommand } from '../../../models/jarvis/commands';

const { DEFAULT_SYSTEM_PT, DEFAULT_SYSTEM_EN, renderPrompt } = require('../../../models/jarvis/systemPrompt');
const { getSetting } = require('../../../models/settings.model');

export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' }, // áudio em base64 pode ser grande
  },
};

/* ─────────────────────────────────────────────
   Helpers — providers
───────────────────────────────────────────── */

function isAnthropic(model) {
  return String(model || '').toLowerCase().includes('claude');
}

async function transcribeAudio(audioBase64) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada — não é possível transcrever áudio.');

  // Detecta header data:audio/...;base64,
  let pure = audioBase64;
  let mime = 'audio/webm';
  const m = String(audioBase64).match(/^data:(.+);base64,(.+)$/);
  if (m) { mime = m[1]; pure = m[2]; }

  const buf = Buffer.from(pure, 'base64');
  const ext = mime.includes('mp3')  ? 'mp3'
            : mime.includes('mp4')  ? 'mp4'
            : mime.includes('mpeg') ? 'mp3'
            : mime.includes('wav')  ? 'wav'
            : mime.includes('m4a')  ? 'm4a'
            : 'webm';

  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Whisper error ${r.status}: ${err}`);
  }
  const json = await r.json();
  return json.text || '';
}

async function callAnthropic({ model, systemPrompt, userText, tools }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada.');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools && tools.length ? tools : undefined,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Anthropic error ${r.status}: ${err}`);
  }
  const data = await r.json();

  // Procura tool_use no content
  let toolCall = null;
  let textOut  = '';
  for (const block of (data.content || [])) {
    if (block.type === 'tool_use') {
      toolCall = { name: block.name, args: block.input || {} };
    } else if (block.type === 'text') {
      textOut += block.text;
    }
  }
  return { toolCall, text: textOut };
}

async function callOpenAI({ model, systemPrompt, userText, tools }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada.');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText },
      ],
      tools: tools && tools.length ? tools : undefined,
      tool_choice: tools && tools.length ? 'auto' : undefined,
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`OpenAI error ${r.status}: ${err}`);
  }
  const data = await r.json();
  const msg  = data.choices?.[0]?.message || {};

  let toolCall = null;
  if (msg.tool_calls && msg.tool_calls[0]) {
    const tc = msg.tool_calls[0];
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
    toolCall = { name: tc.function?.name, args };
  }
  return { toolCall, text: msg.content || '' };
}

/* ─────────────────────────────────────────────
   Handler
───────────────────────────────────────────── */

export default async function handler(req, res) {
  const startedAt = Date.now();
  console.log('[INFO][API:/api/jarvis/command] Requisição', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    /* 1. Resolve sessão + tenant */
    const session = verifyToken(req.cookies?.sigma_token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Não autenticado.' });
    }
    const tenantId = await resolveTenantId(req);
    const user = await queryOne(
      `SELECT id, name, role FROM tenants WHERE id = $1 AND is_active = true LIMIT 1`,
      [session.userId]
    );
    if (!user) return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });

    /* 2. Quota */
    const quota = await checkJarvisQuota(tenantId, user.id, user.role);
    if (!quota.allowed) {
      return res.status(429).json({
        success: false,
        error: `Limite diário do Jarvis atingido (${quota.used}/${quota.limit}). Aguarde até a meia-noite.`,
        quota,
      });
    }

    /* 3. Texto (transcrição se vier áudio) */
    let { text, audioBase64, language } = req.body || {};
    if (!text && audioBase64) {
      try {
        text = await transcribeAudio(audioBase64);
      } catch (err) {
        console.error('[ERRO][API:/api/jarvis/command] Falha na transcrição', { error: err.message });
        return res.status(400).json({ success: false, error: 'Falha ao transcrever áudio: ' + err.message });
      }
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem vazia.' });
    }
    text = String(text).trim().slice(0, 2000);

    /* 4. Config + funções habilitadas */
    const cfg = await getJarvisConfig(tenantId);
    const enabledIds = Object.entries(cfg.functions || {}).filter(([, v]) => v).map(([k]) => k);

    const provider = isAnthropic(cfg.jarvis_model) ? 'anthropic' : 'openai';
    const tools    = getToolDefinitions(enabledIds, provider);

    /* 5. System prompt (usa override da biblioteca se existir) */
    const lang = (language || cfg.jarvis_language || 'pt').toLowerCase();
    const ctx  = {
      tenantName:  user.name || 'Sigma',
      userName:    user.name || 'Operador',
      currentDate: new Date().toLocaleDateString('pt-BR'),
    };
    const promptKey = lang === 'en' ? 'jarvis_system_en' : 'jarvis_system_pt';
    const customPrompt = await getSetting(tenantId, `prompt_library_${promptKey}`);
    const template = customPrompt || (lang === 'en' ? DEFAULT_SYSTEM_EN : DEFAULT_SYSTEM_PT);
    const systemPrompt = renderPrompt(template, ctx);

    let providerResult;
    try {
      providerResult = provider === 'anthropic'
        ? await callAnthropic({ model: cfg.jarvis_model, systemPrompt, userText: text, tools })
        : await callOpenAI   ({ model: cfg.jarvis_model, systemPrompt, userText: text, tools });
    } catch (err) {
      console.error('[ERRO][API:/api/jarvis/command] Provider falhou', { error: err.message });
      await logJarvisUsage(tenantId, user.id, 'error', text, null, Date.now() - startedAt, false, err.message);
      return res.status(502).json({ success: false, error: 'Falha ao consultar a IA: ' + err.message });
    }

    /* 6. Tool execution OU resposta direta */
    let responsePayload;
    if (providerResult.toolCall) {
      try {
        const cmdResult = await executeCommand(
          providerResult.toolCall.name,
          providerResult.toolCall.args,
          tenantId,
          user.id,
          user.role
        );
        responsePayload = {
          response: cmdResult.summary,
          command:  providerResult.toolCall.name,
          data:     cmdResult.data,
          requiresConfirmation: !!cmdResult.requiresConfirmation,
          confirmAction:        cmdResult.confirmAction || null,
        };
        await logJarvisUsage(
          tenantId, user.id,
          providerResult.toolCall.name,
          text, cmdResult.summary,
          Date.now() - startedAt, true, null
        );
      } catch (err) {
        console.error('[ERRO][API:/api/jarvis/command] Tool execution falhou', { error: err.message });
        await logJarvisUsage(tenantId, user.id, providerResult.toolCall.name, text, null, Date.now() - startedAt, false, err.message);
        return res.status(500).json({ success: false, error: 'Falha ao executar tool: ' + err.message });
      }
    } else {
      const txt = providerResult.text || 'Não consegui interpretar o pedido. Tente reformular.';
      responsePayload = { response: txt, command: null, data: null, requiresConfirmation: false };
      await logJarvisUsage(tenantId, user.id, 'chat', text, txt, Date.now() - startedAt, true, null);
    }

    /* 7. Quota atualizada */
    const newQuota = { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) };

    return res.json({
      success: true,
      input: text,
      ...responsePayload,
      quota: newQuota,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/jarvis/command] Erro inesperado', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno no Jarvis.' });
  }
}
