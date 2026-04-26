/**
 * infra/cache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cache in-memory simples com TTL.
 * Nao e distribuido — reseta a cada deploy (aceitavel para dados nao-criticos).
 * Usar apenas para dados lidos frequentemente e raramente alterados.
 *
 * NOTA: Map global ancorado em globalThis pra sobreviver ao HMR do Next em dev.
 *       Em produção é singleton de processo (mesmo comportamento).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Cache global persistente entre recompiles do Next em dev (mesmo padrão do
// pipelineEmitter.js). Em prod build, é apenas no-op.
const store = globalThis.__SIGMA_CACHE__
  || (globalThis.__SIGMA_CACHE__ = new Map()); // key → { value, expiresAt }

const _stats = globalThis.__SIGMA_CACHE_STATS__
  || (globalThis.__SIGMA_CACHE_STATS__ = { hits: 0, misses: 0 });

/**
 * Busca do cache. Retorna null se expirado ou inexistente.
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) { _stats.misses++; return null; }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    _stats.misses++;
    return null;
  }
  _stats.hits++;
  return entry.value;
}

/**
 * Salva no cache com TTL em segundos.
 */
function set(key, value, ttlSeconds = 300) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Invalida uma chave especifica ou padrao (prefix).
 */
function invalidate(keyOrPrefix) {
  for (const key of store.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix + ':')) {
      store.delete(key);
    }
  }
}

/**
 * Wrapper: busca do cache; se miss, executa fn() e armazena resultado.
 */
async function getOrSet(key, fn, ttlSeconds = 300) {
  const cached = get(key);
  if (cached !== null) return cached;
  const value = await fn();
  set(key, value, ttlSeconds);
  return value;
}

/**
 * Snapshot de estatísticas (size + hit rate) para endpoints de saúde.
 * @returns {{size:number, hits:number, misses:number, hitRate:string}}
 */
function getStats() {
  const total = _stats.hits + _stats.misses;
  const rate = total > 0 ? Math.round((_stats.hits / total) * 100) : 0;
  return {
    size:    store.size,
    hits:    _stats.hits,
    misses:  _stats.misses,
    hitRate: `${rate}%`,
  };
}

// ─── Helpers de chave do Gerador de Imagem ──────────────────────────────────
// Centraliza convenção pra evitar typos e facilitar invalidação por prefixo.
// Convenção: módulo:tipo:tenantId:[clientId|provider]
const ImageKeys = {
  brandbookActive: (clientId, tenantId) => `image:bb:${tenantId}:${clientId}`,
  imageSettings:   (tenantId)            => `image:settings:${tenantId}`,
  decryptedKeys:   (tenantId)            => `image:keys:${tenantId}`,
  foldersList:     (clientId, tenantId)  => `image:folders:${tenantId}:${clientId}`,
  templatesList:   (clientId, tenantId)  => `image:templates:${tenantId}:${clientId}`,
};

module.exports = { get, set, invalidate, getOrSet, getStats, ImageKeys };
