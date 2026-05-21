/**
 * lib/env.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper de leitura segura de variáveis de ambiente.
 *
 * Motivação: o projeto tinha fallbacks hardcoded pra `SESSION_SECRET` e
 * `SESSION_SECRET` em segredos de OAuth state (`'sigma-internal-secret-2024'`
 * e `'sigma-ads-oauth-fallback-secret-change-in-prod'`). Se essas envs não
 * estiverem setadas em produção, o app rodava com segredos públicos
 * previsíveis — qualquer atacante poderia forjar tokens HMAC válidos.
 *
 * Solução: `requireEnv(name)` lança em qualquer leitura (boot-time se chamado
 * no top-level do módulo, request-time se dentro de função). Em produção,
 * Next.js falha o startup quando o erro é lançado no boot — exatamente o
 * comportamento desejado. Em dev, falha imediatamente com mensagem clara.
 *
 * Uso:
 *   const SESSION_SECRET = requireEnv('SESSION_SECRET');
 *   const token = requireEnv('INTERNAL_API_TOKEN');
 *
 * Para envs realmente opcionais, use `process.env.X` direto — esse helper é
 * só para segredos críticos onde fallback é inaceitável.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Lê uma variável de ambiente exigindo presença. Lança se vazia/undefined.
 *
 * @param {string} name - nome da env var
 * @returns {string} valor não-vazio
 * @throws {Error} se a env não estiver setada ou for string vazia
 */
function requireEnv(name) {
  const v = process.env[name];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(
      `[FATAL][env] Variável de ambiente obrigatória "${name}" não está definida. ` +
      `Em produção, configurar antes de subir a app. Em dev, definir no .env.`
    );
  }
  return v;
}

module.exports = { requireEnv };
