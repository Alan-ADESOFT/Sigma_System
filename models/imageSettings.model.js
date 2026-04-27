/**
 * @fileoverview Model de configuração do Gerador de Imagem
 * @description CRUD da tabela image_settings (singleton por tenant).
 * Encripta API keys antes de salvar; decripta sob demanda no momento do uso.
 *
 * NUNCA expõe chaves descriptografadas via API — sempre máscara.
 */

const { query, queryOne } = require('../infra/db');
const { encrypt, decrypt, mask, isEncrypted } = require('../infra/encryption');
const { logAudit } = require('./imageAudit.model');
// OTIMIZAÇÃO: cache 10min — settings é leitura quase fria, mudança rara.
const cache = require('../infra/cache');

// Defaults aplicados na criação lazy (alinhados com o schema.sql)
const DEFAULTS = {
  default_model:                  'imagen-4',
  prompt_engineer_model:          'gpt-4o-mini',
  brandbook_extractor_model:      'gpt-4o-mini',
  vertex_location:                'us-central1',
  enabled_models:                 ['imagen-4', 'gpt-image-1', 'flux-1.1-pro', 'nano-banana'],
  daily_limit_admin:              50,
  daily_limit_user:                30,
  hourly_limit_admin:              30,
  hourly_limit_user:                10,
  concurrent_limit_per_tenant:      5,
  max_template_per_client:         20,
  brandbook_required:           false,
  auto_cleanup_days:                7,
  prompt_reuse_window_hours:       24,
};

/**
 * Mapa: nome do provider → coluna criptografada da settings.
 */
const PROVIDER_KEY_COLUMNS = {
  vertex: 'vertex_credentials_encrypted',
  openai: 'openai_api_key_encrypted',
  fal:    'fal_api_key_encrypted',
  gemini: 'gemini_api_key_encrypted',
};

/**
 * Retorna a settings do tenant (lazy create na primeira leitura).
 *
 * @param {string} tenantId
 * @returns {Promise<object>} linha da tabela image_settings
 */
async function getOrCreate(tenantId) {
  if (!tenantId) throw new Error('imageSettings.getOrCreate: tenantId obrigatório');

  // OTIMIZAÇÃO: cache 10min. Worker, generate, rate-limit e UI batem nisso
  // a CADA request. Mutações (update/updateApiKey) invalidam.
  return cache.getOrSet(
    cache.ImageKeys.imageSettings(tenantId),
    async () => {
      let row = await queryOne(
        `SELECT * FROM image_settings WHERE tenant_id = $1`,
        [tenantId]
      );
      if (row) return row;
      console.log('[INFO][ImageSettings] criando settings padrão', { tenantId });
      row = await queryOne(
        `INSERT INTO image_settings (tenant_id) VALUES ($1) RETURNING *`,
        [tenantId]
      );
      return row;
    },
    600 // 10 min
  );
}

function invalidateSettingsCache(tenantId) {
  cache.invalidate(cache.ImageKeys.imageSettings(tenantId));
  cache.invalidate(cache.ImageKeys.decryptedKeys(tenantId));
}

/**
 * Versão "segura" para retornar via API: remove campos *_encrypted e
 * adiciona flags `has_*` + máscaras das primeiras chars (para UI).
 */
async function getPublic(tenantId) {
  const s = await getOrCreate(tenantId);
  return {
    tenant_id:                  s.tenant_id,
    default_model:              s.default_model,
    prompt_engineer_model:      s.prompt_engineer_model,
    brandbook_extractor_model:  s.brandbook_extractor_model,
    vertex_project_id:          s.vertex_project_id || null,
    vertex_location:            s.vertex_location,
    enabled_models:             s.enabled_models,
    daily_limit_admin:          s.daily_limit_admin,
    daily_limit_user:           s.daily_limit_user,
    hourly_limit_admin:         s.hourly_limit_admin,
    hourly_limit_user:          s.hourly_limit_user,
    concurrent_limit_per_tenant: s.concurrent_limit_per_tenant,
    max_template_per_client:    s.max_template_per_client,
    brandbook_required:         s.brandbook_required,
    auto_cleanup_days:          s.auto_cleanup_days,
    prompt_reuse_window_hours:  s.prompt_reuse_window_hours,
    // Flags: tem chave configurada? (sem expor o valor)
    has_vertex_credentials: !!s.vertex_credentials_encrypted,
    has_openai_key:         !!s.openai_api_key_encrypted,
    has_fal_key:            !!s.fal_api_key_encrypted,
    has_gemini_key:         !!s.gemini_api_key_encrypted,
    // Sprint v1.1 — abril 2026: novos campos de configuração
    smart_mode_enabled:     !!s.smart_mode_enabled,
    smart_mode_model:       s.smart_mode_model || 'gpt-4o-mini',
    job_timeout_seconds:    s.job_timeout_seconds || 90,
    title_generator_model:  s.title_generator_model || 'gpt-4o-mini',
    created_at:                 s.created_at,
    updated_at:                 s.updated_at,
  };
}

/**
 * Atualização parcial. NÃO permite atualizar campos *_encrypted diretamente —
 * para chaves use updateApiKey(). Demais campos vão livremente.
 *
 * @param {string} tenantId
 * @param {object} updates - chaves permitidas (ver ALLOWED_FIELDS)
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {object} [opts.req]
 * @returns {Promise<object>} settings atualizada
 */
const ALLOWED_FIELDS = [
  'default_model', 'prompt_engineer_model', 'brandbook_extractor_model',
  'vertex_project_id', 'vertex_location',
  'enabled_models',
  'daily_limit_admin', 'daily_limit_user',
  'hourly_limit_admin', 'hourly_limit_user',
  'concurrent_limit_per_tenant', 'max_template_per_client',
  'brandbook_required', 'auto_cleanup_days', 'prompt_reuse_window_hours',
  // Sprint v1.1 — abril 2026
  'smart_mode_enabled', 'smart_mode_model',
  'job_timeout_seconds', 'title_generator_model',
];

async function update(tenantId, updates, opts = {}) {
  await getOrCreate(tenantId); // garante que existe

  const sets = [];
  const params = [tenantId];
  const changedKeys = [];

  for (const key of Object.keys(updates || {})) {
    if (!ALLOWED_FIELDS.includes(key)) continue;
    let val = updates[key];
    if (key === 'enabled_models' && Array.isArray(val)) {
      val = JSON.stringify(val);
    }
    params.push(val);
    sets.push(`${key} = $${params.length}`);
    changedKeys.push(key);
  }
  if (sets.length === 0) return getOrCreate(tenantId);

  sets.push(`updated_at = now()`);
  const sql = `UPDATE image_settings SET ${sets.join(', ')} WHERE tenant_id = $1 RETURNING *`;
  const row = await queryOne(sql, params);
  invalidateSettingsCache(tenantId);

  // Audit: alterações em limites
  const limitFields = ['daily_limit_admin', 'daily_limit_user', 'hourly_limit_admin',
    'hourly_limit_user', 'concurrent_limit_per_tenant', 'max_template_per_client'];
  if (changedKeys.some(k => limitFields.includes(k))) {
    await logAudit({
      tenantId, userId: opts.userId, req: opts.req,
      action: 'limit_changed',
      details: { changed: changedKeys.filter(k => limitFields.includes(k)) },
    });
  }
  return row;
}

/**
 * Atualiza UMA chave de API (encripta antes de salvar).
 * Para Vertex, `plainValue` é o JSON completo da service account.
 *
 * @param {string} tenantId
 * @param {'vertex'|'openai'|'fal'|'gemini'} provider
 * @param {string} plainValue - texto puro (string ou JSON-stringified)
 * @param {object} [opts] - { userId, req }
 */
async function updateApiKey(tenantId, provider, plainValue, opts = {}) {
  const col = PROVIDER_KEY_COLUMNS[provider];
  if (!col) throw new Error(`updateApiKey: provider desconhecido: ${provider}`);
  await getOrCreate(tenantId);

  const enc = plainValue ? encrypt(String(plainValue)) : null;

  await query(
    `UPDATE image_settings SET ${col} = $1, updated_at = now() WHERE tenant_id = $2`,
    [enc, tenantId]
  );
  invalidateSettingsCache(tenantId);

  await logAudit({
    tenantId, userId: opts.userId, req: opts.req,
    action: 'api_key_changed',
    details: { provider, masked: plainValue ? mask(String(plainValue)) : null, removed: !plainValue },
  });
  console.log('[SUCESSO][ImageSettings] API key atualizada', { tenantId, provider });
}

/**
 * Decripta a chave do provider para uso interno (worker / generate).
 * NUNCA expor o resultado via API — usar somente em chamadas a providers.
 *
 * @param {string} tenantId
 * @param {'vertex'|'openai'|'fal'|'gemini'} provider
 * @returns {Promise<string|null>} chave em texto puro ou null se não configurada
 */
async function getDecryptedKey(tenantId, provider) {
  const col = PROVIDER_KEY_COLUMNS[provider];
  if (!col) throw new Error(`getDecryptedKey: provider desconhecido: ${provider}`);
  const row = await queryOne(
    `SELECT ${col} AS enc FROM image_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!row?.enc) return null;
  if (!isEncrypted(row.enc)) {
    console.warn('[WARN][ImageSettings] valor armazenado não está no formato encrypted', { tenantId, provider });
    return row.enc; // retorna como está (compatibilidade legada)
  }
  return decrypt(row.enc);
}

/**
 * Versão "anotada" da settings com chaves descriptografadas — usada APENAS
 * pelo worker e pelo handler de generate.
 *
 * @param {string} tenantId
 * @returns {Promise<object>} settings + *_decrypted (vertex_credentials, openai, fal, gemini)
 */
async function getWithDecryptedKeys(tenantId) {
  // OTIMIZAÇÃO: cache 10min. Worker chama a CADA job — sem cache,
  // decifraríamos AES-GCM 4× (1 por provider) por geração.
  // Invalidação automática via invalidateSettingsCache em updateApiKey/update.
  return cache.getOrSet(
    cache.ImageKeys.decryptedKeys(tenantId),
    async () => {
      const s = await getOrCreate(tenantId);
      const decrypted = {};
      for (const [provider, col] of Object.entries(PROVIDER_KEY_COLUMNS)) {
        const enc = s[col];
        if (!enc) continue;
        try {
          const plain = isEncrypted(enc) ? decrypt(enc) : enc;
          const decKey = provider === 'vertex'
            ? 'vertex_credentials_decrypted'
            : `${provider}_api_key_decrypted`;
          decrypted[decKey] = plain;
        } catch (err) {
          console.error('[ERRO][ImageSettings] falha ao decriptar', { provider, error: err.message });
        }
      }
      return { ...s, ...decrypted };
    },
    600 // 10 min
  );
}

module.exports = {
  getOrCreate,
  getPublic,
  update,
  updateApiKey,
  getDecryptedKey,
  getWithDecryptedKeys,
  invalidateSettingsCache,
  DEFAULTS,
};
