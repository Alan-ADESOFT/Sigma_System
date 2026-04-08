/**
 * @fileoverview POST /api/jarvis/command
 *
 * Arquitetura:
 *   1. Resolve tenant + user
 *   2. Verifica quota diaria
 *   3. Se audioBase64, transcreve via Whisper
 *   4. Carrega context snapshot (dados do sistema cacheados) + memoria recente
 *   5. Injeta tudo no system prompt — modelo ja tem os dados para responder
 *   6. Se o modelo decidir que precisa de dados frescos, usa function calling
 *   7. Se houver tool_call: executa → devolve resultado ao modelo → resposta final
 *   8. Loga uso (jarvis_usage_log + ai_token_usage)
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { queryOne } from '../../../infra/db';
import { getJarvisConfig } from '../../../models/jarvis/config';
import { checkJarvisQuota, logJarvisUsage, getRecentUsage } from '../../../models/jarvis/rateLimit';
import { getToolDefinitions } from '../../../models/jarvis/tools';
import { executeCommand } from '../../../models/jarvis/commands';

const { DEFAULT_SYSTEM_PT, DEFAULT_SYSTEM_EN, renderPrompt } = require('../../../models/jarvis/systemPrompt');
const { getSetting } = require('../../../models/settings.model');
const { logUsage } = require('../../../models/copy/tokenUsage');
const { buildContextSnapshot, formatMemory } = require('../../../models/jarvis/context');

export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
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

  let pure = audioBase64;
  let mime = 'audio/webm';
  const m = String(audioBase64).match(/^data:(.+);base64,(.+)$/);
  if (m) { mime = m[1]; pure = m[2]; }

  const buf = Buffer.from(pure, 'base64');
  const ext = mime.includes('mp3') ? 'mp3' : mime.includes('mp4') ? 'mp4'
    : mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav'
    : mime.includes('m4a') ? 'm4a' : 'webm';

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

/**
 * Chama Anthropic Messages API. Aceita array de messages para multi-turn.
 */
async function callAnthropic({ model, systemPrompt, messages, tools }) {
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
      messages,
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Anthropic error ${r.status}: ${err}`);
  }
  const data = await r.json();

  let toolCall = null;
  let toolUseId = null;
  let textOut = '';
  for (const block of (data.content || [])) {
    if (block.type === 'tool_use') {
      toolCall = { name: block.name, args: block.input || {} };
      toolUseId = block.id;
    } else if (block.type === 'text') {
      textOut += block.text;
    }
  }

  const usage = {
    input: data.usage?.input_tokens || 0,
    output: data.usage?.output_tokens || 0,
  };
  return { toolCall, toolUseId, text: textOut, rawContent: data.content || [], usage };
}

/**
 * Chama OpenAI Chat Completions API. Aceita array de messages para multi-turn.
 */
async function callOpenAI({ model, messages, tools }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada.');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages,
      tools: tools && tools.length ? tools : undefined,
      tool_choice: tools && tools.length ? 'auto' : undefined,
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`OpenAI error ${r.status}: ${err}`);
  }
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};

  let toolCall = null;
  let toolCallId = null;
  if (msg.tool_calls && msg.tool_calls[0]) {
    const tc = msg.tool_calls[0];
    toolCallId = tc.id;
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
    toolCall = { name: tc.function?.name, args };
  }

  const usage = {
    input: data.usage?.prompt_tokens || 0,
    output: data.usage?.completion_tokens || 0,
  };
  return { toolCall, toolCallId, rawMessage: msg, text: msg.content || '', usage };
}

/* ─────────────────────────────────────────────
   Handler
───────────────────────────────────────────── */

export default async function handler(req, res) {
  const startedAt = Date.now();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    /* 1. Resolve sessao + tenant */
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

    /* 3. Texto (transcricao se vier audio) */
    let { text, audioBase64, language } = req.body || {};
    let inputSource = 'text';
    if (!text && audioBase64) {
      inputSource = 'audio';
      try {
        text = await transcribeAudio(audioBase64);
        console.log('[SUCESSO][Jarvis:Whisper] Transcrição concluída', {
          transcription: text?.slice(0, 200),
          charCount: text?.length || 0,
        });
        logUsage({
          tenantId, modelUsed: 'whisper-1', provider: 'openai',
          operationType: 'jarvis_transcription',
          tokensInput: 0, tokensOutput: 0,
          metadata: { charCount: text?.length || 0 },
        });
      } catch (err) {
        console.error('[ERRO][Jarvis:Whisper] Falha na transcrição', { error: err.message });
        return res.status(400).json({ success: false, error: 'Falha ao transcrever áudio: ' + err.message });
      }
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem vazia.' });
    }
    text = String(text).trim().slice(0, 2000);
    console.log('[INFO][Jarvis:Input]', { inputSource, text: text.slice(0, 150) });

    /* 4. Config + context snapshot + memoria */
    const [cfg, contextSnapshot, recentUsage] = await Promise.all([
      getJarvisConfig(tenantId),
      buildContextSnapshot(tenantId),
      getRecentUsage(tenantId, user.id, 3),
    ]);

    const enabledIds = Object.entries(cfg.functions || {}).filter(([, v]) => v).map(([k]) => k);
    const provider = isAnthropic(cfg.jarvis_model) ? 'anthropic' : 'openai';
    const tools = getToolDefinitions(enabledIds, provider);

    /* 5. System prompt = base + contexto + memoria */
    const lang = (language || cfg.jarvis_language || 'pt').toLowerCase();
    const ctx = {
      tenantName: user.name || 'Sigma',
      userName: user.name || 'Operador',
      currentDate: new Date().toLocaleDateString('pt-BR'),
    };
    const promptKey = lang === 'en' ? 'jarvis_system_en' : 'jarvis_system_pt';
    const customPrompt = await getSetting(tenantId, `prompt_library_${promptKey}`);
    const template = customPrompt || (lang === 'en' ? DEFAULT_SYSTEM_EN : DEFAULT_SYSTEM_PT);
    const basePrompt = renderPrompt(template, ctx);

    const memory = formatMemory(recentUsage);
    const systemPrompt = [
      basePrompt,
      '',
      contextSnapshot,
      '',
      memory,
      '',
      'INSTRUCOES CRITICAS:',
      '1. LEITURA: Para perguntas sobre metricas, financeiro, tarefas, clientes — USE OS DADOS ACIMA sem chamar tools.',
      '2. ESCRITA: Para QUALQUER acao que cria, edita ou envia algo (registrar despesa, registrar receita, criar tarefa, enviar formulario, rodar pipeline) — SEMPRE chame a tool correspondente. NUNCA tente fazer por chat.',
      '3. MEMORIA: O historico recente acima mostra suas ultimas conversas com o usuario. Se o usuario disser "sim", "confirmo", "exato", "isso mesmo", "pode fazer" — ele esta CONFIRMANDO a ultima acao discutida. Chame a tool correspondente imediatamente.',
      '4. ERROS: Se algo nao for possivel (ex: formulario nao preenchido, telefone nao cadastrado), explique o motivo de forma clara e objetiva.',
    ].filter(Boolean).join('\n');

    console.log('[INFO][Jarvis:LLM] Chamando modelo', {
      model: cfg.jarvis_model, provider,
      toolsCount: tools.length,
      contextChars: contextSnapshot.length,
      memoryEntries: recentUsage.length,
    });

    /* 6. Primeira chamada ao LLM */
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    let firstResult;
    try {
      if (provider === 'anthropic') {
        firstResult = await callAnthropic({
          model: cfg.jarvis_model, systemPrompt, tools,
          messages: [{ role: 'user', content: text }],
        });
      } else {
        firstResult = await callOpenAI({
          model: cfg.jarvis_model, tools,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
        });
      }
    } catch (err) {
      console.error('[ERRO][Jarvis:LLM] Turn 1 falhou', { model: cfg.jarvis_model, provider, error: err.message });
      await logJarvisUsage(tenantId, user.id, 'error', text, null, Date.now() - startedAt, false, err.message);
      return res.status(502).json({ success: false, error: 'Falha ao consultar a IA: ' + err.message });
    }

    totalTokensIn += (firstResult.usage?.input || 0);
    totalTokensOut += (firstResult.usage?.output || 0);

    console.log('[SUCESSO][Jarvis:LLM] Turn 1', {
      model: cfg.jarvis_model,
      tokensIn: firstResult.usage?.input || 0,
      tokensOut: firstResult.usage?.output || 0,
      hasToolCall: !!firstResult.toolCall,
      toolName: firstResult.toolCall?.name || null,
    });

    /* 7. Se houve tool_call → executar → devolver ao modelo → resposta final */
    let responsePayload;

    if (firstResult.toolCall) {
      const toolName = firstResult.toolCall.name;
      const toolArgs = firstResult.toolCall.args;

      // Executa a tool
      let cmdResult;
      try {
        cmdResult = await executeCommand(toolName, toolArgs, tenantId, user.id, user.role);
        console.log('[SUCESSO][Jarvis:Tool]', {
          command: toolName,
          requiresConfirmation: !!cmdResult.requiresConfirmation,
          summaryPreview: (cmdResult.summary || '').slice(0, 150),
        });
      } catch (err) {
        console.error('[ERRO][Jarvis:Tool]', { command: toolName, error: err.message });
        await logJarvisUsage(tenantId, user.id, toolName, text, null, Date.now() - startedAt, false, err.message);
        return res.status(500).json({ success: false, error: 'Falha ao executar comando: ' + err.message });
      }

      // Devolve resultado da tool ao LLM (turn 2)
      const toolResultStr = JSON.stringify({ summary: cmdResult.summary, data: cmdResult.data });

      console.log('[INFO][Jarvis:LLM] Turn 2 — devolvendo resultado da tool', { toolName });

      let secondResult;
      try {
        if (provider === 'anthropic') {
          // Anthropic: reconstroi assistant content explicitamente (mesmo approach do OpenAI)
          const assistantContent = [];
          if (firstResult.text) assistantContent.push({ type: 'text', text: firstResult.text });
          assistantContent.push({ type: 'tool_use', id: firstResult.toolUseId, name: toolName, input: toolArgs });

          secondResult = await callAnthropic({
            model: cfg.jarvis_model, systemPrompt, tools,
            messages: [
              { role: 'user', content: text },
              { role: 'assistant', content: assistantContent },
              { role: 'user', content: [{ type: 'tool_result', tool_use_id: firstResult.toolUseId, content: toolResultStr }] },
            ],
          });
        } else {
          // OpenAI: assistant message com tool_calls → tool role message
          // Reconstroi a mensagem do assistant explicitamente para garantir consistencia
          const assistantMsg = {
            role: 'assistant',
            content: firstResult.text || null,
            tool_calls: [{
              id: firstResult.toolCallId,
              type: 'function',
              function: {
                name: toolName,
                arguments: JSON.stringify(toolArgs),
              },
            }],
          };
          secondResult = await callOpenAI({
            model: cfg.jarvis_model, tools,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
              assistantMsg,
              { role: 'tool', tool_call_id: firstResult.toolCallId, content: toolResultStr },
            ],
          });
        }
      } catch (err) {
        // Fallback: se turn 2 falhar, usa summary direto
        console.warn('[WARN][Jarvis:LLM] Turn 2 falhou, usando summary direto', { error: err.message });
        secondResult = { text: cmdResult.summary, usage: { input: 0, output: 0 } };
      }

      totalTokensIn += (secondResult.usage?.input || 0);
      totalTokensOut += (secondResult.usage?.output || 0);

      const finalResponse = secondResult.text || cmdResult.summary || 'Comando executado.';

      console.log('[SUCESSO][Jarvis:LLM] Turn 2 resposta final', {
        tokensIn: secondResult.usage?.input || 0,
        tokensOut: secondResult.usage?.output || 0,
        outputPreview: finalResponse.slice(0, 150),
      });

      responsePayload = {
        response: finalResponse,
        command: toolName,
        data: cmdResult.data,
        requiresConfirmation: !!cmdResult.requiresConfirmation,
        confirmAction: cmdResult.confirmAction || null,
      };

      await logJarvisUsage(tenantId, user.id, toolName, text, finalResponse, Date.now() - startedAt, true, null);

    } else {
      // Resposta direta — modelo respondeu usando o contexto sem precisar de tool
      const txt = firstResult.text || 'Não consegui interpretar o pedido. Tente reformular.';
      responsePayload = { response: txt, command: null, data: null, requiresConfirmation: false };
      console.log('[SUCESSO][Jarvis:Chat] Resposta direta', {
        outputPreview: txt.slice(0, 150),
      });
      await logJarvisUsage(tenantId, user.id, 'chat', text, txt, Date.now() - startedAt, true, null);
    }

    // Registra tokens totais no relatorio
    const operationType = responsePayload.command ? `jarvis_tool_${responsePayload.command}` : 'jarvis_chat';
    logUsage({
      tenantId,
      modelUsed: cfg.jarvis_model,
      provider,
      operationType,
      tokensInput: totalTokensIn,
      tokensOutput: totalTokensOut,
      metadata: {
        userId: user.id,
        inputSource,
        turns: responsePayload.command ? 2 : 1,
        durationMs: Date.now() - startedAt,
      },
    });

    /* 8. Resposta */
    const totalDuration = Date.now() - startedAt;
    const newQuota = { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) };

    console.log('[INFO][Jarvis:Resumo]', {
      model: cfg.jarvis_model, provider, inputSource,
      tokensTotal: totalTokensIn + totalTokensOut,
      turns: responsePayload.command ? 2 : 1,
      command: responsePayload.command,
      durationMs: totalDuration,
      quotaRemaining: newQuota.remaining,
    });

    return res.json({
      success: true,
      input: text,
      ...responsePayload,
      quota: newQuota,
    });
  } catch (err) {
    console.error('[ERRO][Jarvis] Erro inesperado', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno no Jarvis.' });
  }
}
