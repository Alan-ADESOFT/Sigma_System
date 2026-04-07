/**
 * infra/cache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cache in-memory simples com TTL.
 * Nao e distribuido — reseta a cada deploy (aceitavel para dados nao-criticos).
 * Usar apenas para dados lidos frequentemente e raramente alterados.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const store = new Map(); // key → { value, expiresAt }

/**
 * Busca do cache. Retorna null se expirado ou inexistente.
 */
function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
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

module.exports = { get, set, invalidate, getOrSet };
