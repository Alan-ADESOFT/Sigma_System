/**
 * @fileoverview Probe runtime do modelo OpenAI Image disponível para a org.
 * @description Sprint v1.2 — abril/2026.
 *
 * Algumas orgs OpenAI não têm `gpt-image-2` habilitado (precisa verificação).
 * Este módulo testa em ordem `gpt-image-2` → `gpt-image-1.5` → `gpt-image-1`
 * via uma chamada minúscula (1× $0.04 quando o modelo passa) e cacheia o
 * resultado em `image_settings.openai_image_model_resolved` pra não probrar
 * a cada boot do worker.
 *
 * Estratégia: usa /v1/models endpoint (lista modelos disponíveis pra org —
 * GRATUITO, não custa nada). Se a OpenAI retornar o ID na lista, considera
 * disponível. Cai pro próximo se 404 ou ausente.
 *
 * Em caso de TODAS as opções falharem, retorna null e o worker loga warning;
 * autoMode evita escolher gpt-image-2 e o usuário recebe erro friendly se
 * tentar manualmente em modo avançado.
 */

const ENDPOINT_MODELS = 'https://api.openai.com/v1/models';

const PROBE_ORDER = ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'];

/**
 * Lista modelos disponíveis pra org via /v1/models. Cacheado pelo caller.
 *
 * @param {string} apiKey
 * @returns {Promise<Set<string>>} ids dos modelos disponíveis
 */
async function listAvailableModels(apiKey) {
  if (!apiKey) return new Set();

  let resp;
  try {
    resp = await fetch(ENDPOINT_MODELS, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
  } catch (err) {
    console.warn('[WARN][Probe:OpenAI] /v1/models indisponível', { error: err.message });
    return new Set();
  }

  if (!resp.ok) {
    console.warn('[WARN][Probe:OpenAI] /v1/models retornou erro', {
      status: resp.status,
    });
    return new Set();
  }

  let body;
  try {
    body = await resp.json();
  } catch {
    return new Set();
  }

  const ids = Array.isArray(body?.data) ? body.data.map(m => m?.id).filter(Boolean) : [];
  return new Set(ids);
}

/**
 * Resolve qual `gpt-image-*` está disponível pra org.
 * Retorna null se nenhum dos 3 está acessível.
 *
 * @param {string} apiKey - decrypted OpenAI API key
 * @returns {Promise<string|null>}
 */
async function probeOpenAIImageModel(apiKey) {
  if (!apiKey) {
    console.log('[INFO][Probe:OpenAI] sem chave configurada — pulando probe');
    return null;
  }

  console.log('[INFO][Probe:OpenAI] resolvendo modelo disponível');
  const available = await listAvailableModels(apiKey);
  if (available.size === 0) {
    console.warn('[WARN][Probe:OpenAI] não foi possível listar modelos — assumindo gpt-image-1');
    return 'gpt-image-1';
  }

  for (const candidate of PROBE_ORDER) {
    if (available.has(candidate)) {
      console.log('[SUCESSO][Probe:OpenAI] modelo resolvido', { modelId: candidate });
      return candidate;
    }
  }

  console.warn('[WARN][Probe:OpenAI] nenhum gpt-image-* na org', {
    tried: PROBE_ORDER,
    sample: Array.from(available).slice(0, 8),
  });
  return null;
}

module.exports = {
  probeOpenAIImageModel,
  PROBE_ORDER,
};
