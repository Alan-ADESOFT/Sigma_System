/**
 * server/apifyWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Worker que executa um job Apify completo:
 *   1. Marca lista como 'running'
 *   2. Inicia run no actor
 *   3. Faz polling de status a cada 10s (timeout 15min)
 *   4. Coleta resultados, mapeia, calcula sigma_score
 *   5. Insere em chunks na tabela comercial_leads
 *   6. Marca lista como 'completed' (ou 'failed')
 *   7. Emite eventos via emitter pra SSE consumir.
 *
 * Reusa infra/pipelineEmitter.js (mesmo Map global) — emit('event', payload).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const apifyMaps = require('../infra/api/apifyMaps');
const leadList = require('../models/comercial/leadList.model');
const { calculateSigmaScore } = require('../models/comercial/sigmaScore');
const { createNotification } = require('../models/clientForm');

const POLL_INTERVAL_MS = 10000;   // 10s
const TIMEOUT_MS       = 15 * 60 * 1000; // 15min

function emit(emitter, payload) {
  if (!emitter) return;
  try { emitter.emit('event', payload); } catch (err) {
    console.error('[ERRO][server/apifyWorker:emit]', { error: err.message });
  }
}

/**
 * @param {Object} job
 * @param {string} job.tenantId
 * @param {string} job.listId
 * @param {Object} job.filters - { niche, state, city, minRating, minReviews, hasWebsite, maxLeads }
 * @param {EventEmitter} job.emitter
 */
async function runCaptacaoJob({ tenantId, listId, filters, emitter }) {
  console.log('[INFO][server/apifyWorker:runCaptacaoJob]', { tenantId, listId, filters });

  try {
    await leadList.updateListStatus(listId, tenantId, { status: 'running' });
    emit(emitter, { type: 'progress', stage: 'starting', message: 'Iniciando Apify...' });

    // ── 1. Inicia run ──
    const searchStrings = apifyMaps.buildSearchStrings({
      niche: filters.niche,
      state: filters.state,
      city:  filters.city,
    });
    const maxLeads = Math.min(Math.max(Number(filters.maxLeads || 100), 1), 1000);
    const perSearch = Math.max(20, Math.ceil(maxLeads / Math.max(searchStrings.length, 1)));

    const input = {
      searchStringsArray: searchStrings,
      maxCrawledPlacesPerSearch: perSearch,
      language: 'pt-BR',
      countryCode: 'br',
    };

    emit(emitter, { type: 'progress', stage: 'submitting', message: `Enviando ${searchStrings.length} busca(s) ao Apify...` });
    const { runId, datasetId } = await apifyMaps.startRun(input);
    await leadList.updateListStatus(listId, tenantId, { apifyRunId: runId });
    emit(emitter, { type: 'progress', stage: 'submitted', runId, message: 'Run iniciada — aguardando scraping...' });

    // ── 2. Polling ──
    const startedAt = Date.now();
    let finalDatasetId = datasetId;
    let lastItemCount = 0;

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      let info;
      try {
        info = await apifyMaps.getRunStatus(runId);
      } catch (err) {
        console.error('[ERRO][server/apifyWorker] poll falhou', { error: err.message });
        emit(emitter, { type: 'progress', stage: 'polling-error', message: err.message });
        continue;
      }

      const itemCount = info.stats?.itemCount ?? info.progress?.itemCount ?? lastItemCount;
      if (itemCount > lastItemCount) {
        lastItemCount = itemCount;
        emit(emitter, { type: 'progress', stage: 'scraping', count: itemCount, message: `${itemCount} leads coletados...` });
      }

      if (info.status === 'SUCCEEDED') {
        finalDatasetId = info.datasetId || datasetId;
        emit(emitter, { type: 'progress', stage: 'fetching', message: 'Scraping concluído. Baixando resultados...' });
        break;
      }
      if (['FAILED', 'TIMING-OUT', 'TIMED-OUT', 'ABORTED'].includes(info.status)) {
        throw new Error(`Apify run terminou em status: ${info.status}`);
      }
    }

    if (Date.now() - startedAt >= TIMEOUT_MS) {
      throw new Error('Timeout (15min) excedido aguardando Apify');
    }

    // ── 3. Resultados ──
    const places = await apifyMaps.getRunResults(finalDatasetId, { limit: maxLeads });
    emit(emitter, { type: 'progress', stage: 'processing', message: `Processando ${places.length} lugares...` });

    // ── 4. Mapeia + filtra + score ──
    const mapped = [];
    for (const place of places) {
      const lead = apifyMaps.mapApifyPlaceToLead(place, filters);
      if (!lead) continue;
      lead.sigma_score = calculateSigmaScore(lead);
      mapped.push(lead);
    }

    // ── 5. Insere ──
    const inserted = await leadList.addLeadsToList(listId, tenantId, mapped);

    // ── 6. Marca completed ──
    await leadList.updateListStatus(listId, tenantId, {
      status: 'completed',
      totalLeads: inserted,
    });

    emit(emitter, { type: 'done', totalLeads: inserted, message: `${inserted} leads salvos.` });

    // Notificação no sininho
    try {
      await createNotification(
        tenantId,
        'system',
        'Captação de leads concluída',
        `${inserted} leads captados via Google Maps (${filters.niche} / ${filters.state}).`,
        null,
        { listId, source: 'apify' }
      );
    } catch (err) {
      console.error('[ERRO][server/apifyWorker] notificação falhou', { error: err.message });
    }

    console.log('[SUCESSO][server/apifyWorker:runCaptacaoJob]', { listId, inserted });
    return { inserted };
  } catch (err) {
    console.error('[ERRO][server/apifyWorker:runCaptacaoJob]', { error: err.message, stack: err.stack });
    await leadList.updateListStatus(listId, tenantId, {
      status: 'failed',
      errorMessage: err.message,
    }).catch(() => {});
    emit(emitter, { type: 'error', message: err.message });

    try {
      await createNotification(
        tenantId,
        'system',
        'Captação de leads falhou',
        `Erro durante captação: ${err.message.slice(0, 200)}`,
        null,
        { listId, error: err.message }
      );
    } catch {}

    throw err;
  }
}

module.exports = { runCaptacaoJob };
