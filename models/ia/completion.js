/**
 * @fileoverview Roteador unificado de completion de texto
 * @description Decide automaticamente qual API usar (OpenAI ou Anthropic)
 * com base no model ID resolvido via variáveis de ambiente.
 * Registra uso de tokens automaticamente via logUsage (silencioso).
 */

const openai = require('../../infra/api/openai');
const anthropic = require('../../infra/api/anthropic');
const { logUsage } = require('../copy/tokenUsage');

/**
 * Mapa de níveis para variáveis de ambiente dos modelos
 * @type {Record<string, string>}
 */
const MODEL_LEVEL_MAP = {
  weak:   'AI_MODEL_WEAK',
  medium: 'AI_MODEL_MEDIUM',
  strong: 'AI_MODEL_STRONG',
};

/**
 * Resolve o model ID completo a partir de um nível semântico
 * @param {string} level - 'weak' | 'medium' | 'strong'
 * @returns {string} Model ID do .env
 */
function resolveModel(level) {
  const envKey = MODEL_LEVEL_MAP[level] || MODEL_LEVEL_MAP.medium;
  const model = process.env[envKey];
  if (!model) {
    throw new Error(`Variável de ambiente ${envKey} não configurada no .env`);
  }
  return model;
}

/**
 * Roteador de completion — decide OpenAI ou Anthropic pelo model ID
 * - model contém "claude" → Anthropic Messages API
 * - model contém "gpt" ou "o1" → OpenAI Chat Completions API
 *
 * @param {string} modelLevel - 'weak' | 'medium' | 'strong'
 * @param {string} systemPrompt - Prompt do sistema
 * @param {string} userMessage - Mensagem do usuário
 * @param {number} [maxTokens=2000] - Limite de tokens
 * @param {object} [opts] - Opcoes para tracking de tokens (nao quebra chamadas existentes)
 * @param {string} [opts.tenantId] - ID do tenant
 * @param {string} [opts.operationType] - Tipo de operacao ('pipeline', 'copy_generate', etc.)
 * @param {string} [opts.clientId] - ID do cliente
 * @param {string} [opts.sessionId] - ID da sessao
 * @returns {Promise<{text: string, modelUsed: string, usage: {input: number, output: number, total: number}}>}
 */
async function runCompletion(modelLevel, systemPrompt, userMessage, maxTokens = 2000, opts = {}) {
  const model = resolveModel(modelLevel);
  const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';
  const providerTag = provider === 'Anthropic' ? '🟣 ANTHROPIC' : '🟢 OPENAI';
  console.log(`[INFO][Completion] ──── ${providerTag} ────`, { modelLevel, model });

  let text, usage;
  if (provider === 'Anthropic') {
    const result = await anthropic.generateCompletion(model, systemPrompt, userMessage, maxTokens);
    text = result.text;
    usage = result.usage;
  } else {
    const result = await openai.generateCompletion(model, systemPrompt, userMessage, maxTokens);
    text = result.text;
    usage = result.usage;
  }

  console.log(`[SUCESSO][Completion] ──── ${providerTag} ──── Texto gerado`, { model, tokens: usage.total, responseLength: text.length });

  // Registra uso de tokens (silencioso — nunca bloqueia)
  if (opts.tenantId) {
    logUsage({
      tenantId: opts.tenantId,
      modelUsed: model,
      provider: provider.toLowerCase(),
      operationType: opts.operationType || 'general',
      clientId: opts.clientId || null,
      sessionId: opts.sessionId || null,
      tokensInput: usage.input,
      tokensOutput: usage.output,
    });
  }

  return { text, modelUsed: model, usage };
}

/**
 * Streaming de completion — AsyncGenerator que yield chunks de texto
 * Suporta OpenAI e Anthropic via fetch nativo com SSE parsing.
 *
 * @param {string} modelLevel - 'weak' | 'medium' | 'strong'
 * @param {string} systemPrompt - Prompt do sistema
 * @param {string} userMessage - Mensagem do usuário
 * @param {number} [maxTokens=4000] - Limite de tokens
 * @yields {{ delta: string, fullText: string, done: boolean, modelUsed: string }}
 */
async function* runCompletionStream(modelLevel, systemPrompt, userMessage, maxTokens = 4000) {
  const model = resolveModel(modelLevel);
  const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';
  const providerTag = provider === 'Anthropic' ? '🟣 ANTHROPIC' : '🟢 OPENAI';
  console.log(`[INFO][Completion:Stream] ──── ${providerTag} ──── Iniciando streaming`, { modelLevel, model });

  // Anthropic exige user message não-vazio. OpenAI tolera, mas padronizamos.
  const safeUserMessage = (userMessage && String(userMessage).trim())
    ? userMessage
    : 'Continue.';

  let fullText = '';

  if (provider === 'OpenAI') {
    // ── OpenAI Streaming ──────────────────────────────────────────────────
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY não configurada no .env');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: safeUserMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`OpenAI Stream Error ${response.status}: ${err}`);
    }

    // Parse SSE do ReadableStream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // última linha pode estar incompleta

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            yield { delta, fullText, done: false, modelUsed: model };
          }
        } catch {}
      }
    }

  } else {
    // ── Anthropic Streaming ───────────────────────────────────────────────
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY não configurada no .env');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: safeUserMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Anthropic Stream Error ${response.status}: ${err}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        try {
          const json = JSON.parse(payload);
          // Anthropic envia content_block_delta com type 'text_delta'
          if (json.type === 'content_block_delta' && json.delta?.text) {
            const delta = json.delta.text;
            fullText += delta;
            yield { delta, fullText, done: false, modelUsed: model };
          }
        } catch {}
      }
    }
  }

  console.log(`[SUCESSO][Completion:Stream] ──── ${providerTag} ──── Streaming concluido`, { model, totalLength: fullText.length });
  yield { delta: '', fullText, done: true, modelUsed: model };
}

/**
 * Roda completion com model ID explícito (sem resolver por nível).
 * Reutiliza a mesma lógica de roteamento OpenAI/Anthropic.
 *
 * @param {string} modelId - Model ID direto (ex: 'gpt-4o-mini', 'claude-opus-4-5')
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} [maxTokens=2000]
 * @param {object} [opts]
 * @returns {Promise<{text: string, modelUsed: string, usage: {input: number, output: number, total: number}}>}
 */
async function runCompletionWithModel(modelId, systemPrompt, userMessage, maxTokens = 2000, opts = {}) {
  const provider = modelId.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';
  const providerTag = provider === 'Anthropic' ? '🟣 ANTHROPIC' : '🟢 OPENAI';
  console.log(`[INFO][Completion] ──── ${providerTag} ──── Model direto`, { modelId });

  let text, usage;
  if (provider === 'Anthropic') {
    const result = await anthropic.generateCompletion(modelId, systemPrompt, userMessage, maxTokens);
    text = result.text;
    usage = result.usage;
  } else {
    const result = await openai.generateCompletion(modelId, systemPrompt, userMessage, maxTokens);
    text = result.text;
    usage = result.usage;
  }

  console.log(`[SUCESSO][Completion] ──── ${providerTag} ──── Texto gerado (model direto)`, { modelId, tokens: usage.total, responseLength: text.length });

  if (opts.tenantId) {
    logUsage({
      tenantId: opts.tenantId,
      modelUsed: modelId,
      provider: provider.toLowerCase(),
      operationType: opts.operationType || 'general',
      clientId: opts.clientId || null,
      sessionId: opts.sessionId || null,
      tokensInput: usage.input,
      tokensOutput: usage.output,
    });
  }

  return { text, modelUsed: modelId, usage };
}

/**
 * Detecta se o erro é de quota insuficiente ou limite de tokens
 * @param {Error} err
 * @returns {boolean}
 */
function isTokenOrQuotaError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('quota') || msg.includes('rate_limit') || msg.includes('insufficient') ||
         msg.includes('context_length') || msg.includes('max_tokens') || msg.includes('overloaded');
}

/**
 * Roda completion com fallback automático se o modelo principal falhar.
 * Consulta as configurações do tenant para saber se fallback está ativo e qual modelo usar.
 * Loga [FALLBACK] no console quando acionado.
 *
 * @param {string} tenantId
 * @param {string} modelLevel - 'weak' | 'medium' | 'strong'
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} [maxTokens=2000]
 * @param {object} [opts]
 * @returns {Promise<{text: string, modelUsed: string, usage: object, usedFallback: boolean, fallbackModel?: string}>}
 */
async function runCompletionWithFallback(tenantId, modelLevel, systemPrompt, userMessage, maxTokens = 2000, opts = {}) {
  // 1. Tenta modelo principal normalmente
  try {
    const result = await runCompletion(modelLevel, systemPrompt, userMessage, maxTokens, { ...opts, tenantId });
    return { ...result, usedFallback: false };
  } catch (primaryErr) {
    // 2. Só tenta fallback em erros de quota/token
    if (!isTokenOrQuotaError(primaryErr)) throw primaryErr;

    // 3. Verifica se fallback está habilitado para este tenant
    const { getSetting } = require('../settings.model');
    const fallbackEnabled = await getSetting(tenantId, 'pipeline_fallback_enabled');
    if (fallbackEnabled !== 'true') throw primaryErr;

    const fallbackModel = await getSetting(tenantId, 'pipeline_fallback_model') || 'gpt-4o-mini';
    console.warn(`[FALLBACK][Completion] Modelo principal falhou — usando fallback`, {
      tenantId,
      modelLevel,
      primaryError: primaryErr.message,
      fallbackModel,
    });

    // 4. Roda com fallback (passa model ID diretamente, não por nível)
    const result = await runCompletionWithModel(fallbackModel, systemPrompt, userMessage, maxTokens, {
      ...opts,
      tenantId,
      operationType: opts.operationType ? `${opts.operationType}_fallback` : 'fallback',
    });
    return { ...result, usedFallback: true, fallbackModel };
  }
}

module.exports = { runCompletion, resolveModel, runCompletionStream, runCompletionWithFallback, runCompletionWithModel };
