/**
 * instrumentation.js (raiz do projeto)
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook obrigatório do Next 14 quando `experimental.instrumentationHook: true`.
 * O Next procura este arquivo na raiz (ou em src/) — NÃO em server/.
 *
 * Esse arquivo é compilado pra AMBOS os runtimes (Node.js e Edge). O guard
 * `NEXT_RUNTIME !== 'nodejs'` garante que o código real só roda em Node.
 *
 * As deps Node-only (crypto, sharp, fs etc.) são marcadas como fallback:false
 * em next.config.js sob `webpack({ nextRuntime: 'edge' })`. Isso permite
 * o build do Edge sucerder mesmo carregando estaticamente a árvore.
 *
 * Schedulers (apenas Node):
 *   1. scheduler.service       — publica `contents` via Meta API
 *   2. instagramPublisher      — publica `instagram_scheduled_posts`
 *   3. imageWorker             — processa fila de `image_jobs`
 */

async function register() {
  // CRÍTICO: o `if` precisa ENVOLVER o import (não apenas early-return antes dele).
  // Webpack substitui `process.env.NEXT_RUNTIME` pelo literal do runtime em build-time
  // e elimina o bloco inteiro como dead-code no build do Edge — assim ./server/instrumentation
  // (que puxa sharp → node:child_process) nem é traçado pro bundle Edge.
  // Padrão early-return NÃO funciona pra DCE; ver vercel/next.js#49565.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const mod = await import('./server/instrumentation.js');
    const fn = mod.register || (mod.default && mod.default.register);
    if (typeof fn === 'function') {
      await fn();
    } else {
      console.error('[ERRO][instrumentation] register() não encontrado em ./server/instrumentation.js');
    }
  }
}

module.exports = { register };
