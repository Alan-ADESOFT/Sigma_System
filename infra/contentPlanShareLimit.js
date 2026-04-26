/**
 * infra/contentPlanShareLimit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Rate limit em memoria para tentativas de PIN em links publicos do
 * Planejamento de Conteudo. 3 falhas em 15 minutos → bloqueio do token.
 *
 * Bloqueia por TOKEN (não por IP) — o atacante teria que descobrir tokens
 * separados. Multi-instance precisa mover pro DB ou Redis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/** @type {Map<string, { count: number, firstAt: number }>} */
const ATTEMPTS = new Map();

function _gc() {
  const now = Date.now();
  for (const [k, v] of ATTEMPTS) {
    if (now - v.firstAt > WINDOW_MS) ATTEMPTS.delete(k);
  }
}

function isLocked(token) {
  if (!token) return false;
  _gc();
  const entry = ATTEMPTS.get(token);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    ATTEMPTS.delete(token);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(token) {
  if (!token) return;
  const now = Date.now();
  const entry = ATTEMPTS.get(token);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    ATTEMPTS.set(token, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailures(token) {
  if (token) ATTEMPTS.delete(token);
}

function remainingMs(token) {
  const entry = ATTEMPTS.get(token);
  if (!entry) return 0;
  return Math.max(0, WINDOW_MS - (Date.now() - entry.firstAt));
}

module.exports = {
  isLocked,
  registerFailure,
  clearFailures,
  remainingMs,
  WINDOW_MS,
  MAX_ATTEMPTS,
};
