/**
 * infra/jobLock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @fileoverview Lock em memória para jobs concorrentes (single-instance).
 * @description Map global "scope:resourceId" → jobInfo pra impedir que o mesmo
 * recurso (ex: lead) tenha 2 jobs IA rodando ao mesmo tempo.
 *
 * Funciona em single-instance (dev + deploy simples).
 * TODO: Em produção multi-instance, substituir por Redis SETNX com TTL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @type {Map<string, { jobId: string, startedAt: number }>}
 *
 * Ancorado em globalThis para sobreviver aos recompiles do Next dev
 * — caso contrário cada rota nova criaria um Map vazio e o lock não
 * funcionaria entre /analyze e /analyze-status.
 */
const ACTIVE_JOBS = globalThis.__SIGMA_JOB_LOCKS__
  || (globalThis.__SIGMA_JOB_LOCKS__ = new Map());

const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — auto-libera locks "esquecidos"

function buildKey(scope, resourceId) {
  return `${scope}:${resourceId}`;
}

/**
 * Tenta adquirir lock. Retorna jobInfo existente se já tem job rodando,
 * ou null se conseguiu o lock (caller pode prosseguir).
 *
 * @param {string} scope        ex: 'lead_analysis'
 * @param {string} resourceId   ex: leadId
 * @param {string} jobId        ID único desse job
 * @returns {{ jobId, startedAt } | null} — null = lock adquirido
 */
function tryAcquire(scope, resourceId, jobId) {
  const key = buildKey(scope, resourceId);
  const existing = ACTIVE_JOBS.get(key);

  // Auto-libera locks stale (10min)
  if (existing && Date.now() - existing.startedAt > STALE_TIMEOUT_MS) {
    console.warn('[WARN][jobLock] Liberando lock stale', { key, age: Date.now() - existing.startedAt });
    ACTIVE_JOBS.delete(key);
  }

  if (ACTIVE_JOBS.has(key)) {
    return ACTIVE_JOBS.get(key);
  }

  ACTIVE_JOBS.set(key, { jobId, startedAt: Date.now() });
  return null;
}

function release(scope, resourceId) {
  const key = buildKey(scope, resourceId);
  return ACTIVE_JOBS.delete(key);
}

function getActive(scope, resourceId) {
  return ACTIVE_JOBS.get(buildKey(scope, resourceId)) || null;
}

function isActive(scope, resourceId) {
  return ACTIVE_JOBS.has(buildKey(scope, resourceId));
}

module.exports = { tryAcquire, release, getActive, isActive };
