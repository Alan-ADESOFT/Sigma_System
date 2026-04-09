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

  // OCULTO TEMPORARIAMENTE — Scheduler legado (contents → meta-publish)
  // try {
  //   const { startScheduler } = require('../models/scheduler.service');
  //   startScheduler();
  // } catch (err) {
  //   console.error('[ERRO][instrumentation] scheduler.service:', err.message);
  // }

  // OCULTO TEMPORARIAMENTE — Instagram publisher (instagram_scheduled_posts) — 10 min
  // try {
  //   const { startInstagramPublisher } = require('./instagramPublisher');
  //   startInstagramPublisher();
  // } catch (err) {
  //   console.error('[ERRO][instrumentation] instagramPublisher:', err.message);
  // }
}

module.exports = { register };
