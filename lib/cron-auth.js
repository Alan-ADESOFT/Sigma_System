/**
 * lib/cron-auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Autenticação dos endpoints de cron (`/api/cron/*`).
 *
 * Antes deste patch, cada cron fazia:
 *   if (req.headers['x-internal-token'] !== process.env.INTERNAL_API_TOKEN) ...
 *
 * Dois problemas:
 *   1. Se `INTERNAL_API_TOKEN` não estiver setado, `undefined !== undefined`
 *      retorna false — o cron ACEITA qualquer requisição (bypass total).
 *   2. Comparação com `!==` não é timing-safe. Risco teórico é baixo (token
 *      de 32 bytes hex é infactível por timing), mas anti-padrão.
 *
 * Solução: `verifyCronToken(req)` lança em startup se a env não existir
 * (via `requireEnv`) e usa `crypto.timingSafeEqual` com guard de tamanho.
 *
 * Uso típico:
 *   if (!verifyCronToken(req)) {
 *     return res.status(401).json({ success: false, error: 'Token inválido' });
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const { requireEnv } = require('./env');

/**
 * Valida o header `x-internal-token` do cron de forma timing-safe.
 *
 * @param {object} req - Next.js request
 * @returns {boolean} true se token confere; false caso contrário.
 *                   NUNCA retorna true se a env estiver vazia (requireEnv lança).
 */
function verifyCronToken(req) {
  const expected = requireEnv('INTERNAL_API_TOKEN');
  const got = req.headers['x-internal-token'] || '';
  if (typeof got !== 'string' || got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = { verifyCronToken };
