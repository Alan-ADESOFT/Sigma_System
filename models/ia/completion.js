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
  console.log('[INFO][Completion] Roteando para provider', { modelLevel, model, provider });

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

  console.log('[SUCESSO][Completion] Texto gerado', { model, provider, responseLength: text.length, usage });

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
  console.log('[INFO][Completion:Stream] Iniciando streaming', { modelLevel, model, provider });

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
          { role: 'user', content: userMessage },
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
        messages: [{ role: 'user', content: userMessage }],
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

  console.log('[SUCESSO][Completion:Stream] Streaming concluído', { model, provider, totalLength: fullText.length });
  yield { delta: '', fullText, done: true, modelUsed: model };
}

module.exports = { runCompletion, resolveModel, runCompletionStream };
