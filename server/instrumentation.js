/**
 * server/instrumentation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Bootstrap dos schedulers internos do Next.js.
 *
 * Próprio do Next 14: este arquivo é carregado uma vez no boot do server
 * (controlado por `experimental.instrumentationHook` no next.config.js).
 *
 * Schedulers ativos:
 *   1. scheduler.service       — legado: publica `contents` (1 min de polling)
 *   2. instagramPublisher      — novo: publica `instagram_scheduled_posts` (10 min)
 *
 * IMPORTANTE: ambos rodam EM PROCESSO. Em produção single-instance funcionam
 * normal. Em produção multi-instance (Vercel/Lambda) você deve desligar estes
 * schedulers internos e usar Vercel Cron chamando os endpoints externos:
 *   - /api/cron/instagram-publisher       (a cada 10 min)
 *   - /api/cron/instagram-refresh-tokens  (1x por dia)
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Scheduler legado (contents → meta-publish)
  try {
    const { startScheduler } = require('../models/scheduler.service');
    startScheduler();
  } catch (err) {
    console.error('[ERRO][instrumentation] scheduler.service:', err.message);
  }

  // Instagram publisher novo (instagram_scheduled_posts) — 10 min
  try {
    const { startInstagramPublisher } = require('./instagramPublisher');
    startInstagramPublisher();
  } catch (err) {
    console.error('[ERRO][instrumentation] instagramPublisher:', err.message);
  }

  // Worker do Gerador de Imagem — fila image_jobs + cleanup diário 03:00
  try {
    const { startImageWorker } = require('./imageWorker');
    startImageWorker();
  } catch (err) {
    console.error('[ERRO][instrumentation] imageWorker:', err.message);
  }

  // Cleanup diario de exports de copy (>7 dias) — roda 1x ao boot e a cada 24h.
  // Mantem barato pq apaga so files do disco + zera result_url no banco.
  try {
    const { cleanupOldExports } = require('../models/copy/exportJobRunner');
    const runCleanup = async () => {
      try { await cleanupOldExports(7); }
      catch (err) { console.error('[ERRO][instrumentation] cleanupOldExports:', err.message); }
    };
    // Primeiro disparo defasado em 5min pra nao competir com o startup
    setTimeout(runCleanup, 5 * 60_000);
    setInterval(runCleanup, 24 * 60 * 60_000);
    console.log('[INFO][instrumentation] cleanup de exports agendado (24h)');
  } catch (err) {
    console.error('[ERRO][instrumentation] copy export cleanup:', err.message);
  }

  // Crons comerciais — rodam EM PROCESSO (1x ao boot, defasado, + a cada 24h):
  //   · limpeza de listas de captação expiradas
  //   · aviso 24h antes de propostas publicadas expirarem
  // Os endpoints /api/cron/comercial-* continuam disponíveis pra Vercel Cron
  // (multi-instance); aqui é o fallback single-instance (dev e prod single).
  try {
    const { runCleanupCycle } = require('./comercialCleanup');
    const { notifyExpiringProposals } = require('../models/comercial/proposalExpiry');
    const runComercialCrons = async () => {
      try { await runCleanupCycle(); }
      catch (err) { console.error('[ERRO][instrumentation] comercialCleanup:', err.message); }
      try { await notifyExpiringProposals(); }
      catch (err) { console.error('[ERRO][instrumentation] proposalsExpiring:', err.message); }
    };
    // Defasado em 6min pra não competir com startup nem com o cleanup de exports (5min)
    setTimeout(runComercialCrons, 6 * 60_000);
    setInterval(runComercialCrons, 24 * 60 * 60_000);
    console.log('[INFO][instrumentation] crons comerciais agendados (24h)');
  } catch (err) {
    console.error('[ERRO][instrumentation] crons comerciais:', err.message);
  }
}

module.exports = { register };
