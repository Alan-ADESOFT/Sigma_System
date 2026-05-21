/**
 * @fileoverview Runner async dos jobs de export de copy
 *
 * Cria registro em copy_export_jobs, dispara processExportJob via
 * setImmediate (mesmo padrao do copyJobRunner), grava o arquivo final em
 * public/uploads/exports/{tenantId}/{yyyy-mm}/{jobId}.{ext} e atualiza o
 * job com result_url + result_size_bytes + duration_ms. Ao concluir,
 * dispara notificacao no sininho.
 *
 * preview (HTML) NAO passa por aqui — o endpoint /api/copy/export
 * resolve preview de forma sincrona pra evitar latencia desnecessaria.
 */

const fs = require('fs').promises;
const path = require('path');
const { query, queryOne } = require('../../infra/db');
const { renderLandingPage }    = require('./exportTemplates/landingPage');
const { renderContentPlanning } = require('./exportTemplates/contentPlanning');
const { renderFreeform }       = require('./exportTemplates/freeform');
const {
  renderLandingDocx, renderPlanningDocx, renderFreeformDocx,
} = require('./exportDocx');

const EXPORT_ROOT = path.join(process.cwd(), 'public', 'uploads', 'exports');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sprint Copy v2.1: brandbook do cliente NAO eh mais consultado — identidade
 * SIGMA fixa em todos exports (feedback do usuario). Mantemos apenas dados
 * basicos do cliente (company_name) pra rotular o doc.
 */
async function loadSessionContext(sessionId, tenantId) {
  const session = await queryOne(
    `SELECT id, tenant_id, output_text, client_id, model_used
       FROM copy_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );
  if (!session) throw new Error('Sessao nao encontrada');

  let client = null;
  if (session.client_id) {
    client = await queryOne(
      `SELECT id, company_name, niche, main_product
         FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
      [session.client_id, tenantId]
    );
  }

  return { session, client };
}

function pickHtmlRenderer(template) {
  if (template === 'landing')  return renderLandingPage;
  if (template === 'planning') return renderContentPlanning;
  return renderFreeform;
}

function pickDocxRenderer(template) {
  if (template === 'landing')  return renderLandingDocx;
  if (template === 'planning') return renderPlanningDocx;
  return renderFreeformDocx;
}

/**
 * Sprint Copy v2.1: pipeline editorial dos exports.
 *   1. Carrega copy + dados basicos do cliente (sem brandbook)
 *   2. Roda exportEnricher (Sonnet 4.6) — devolve JSON estruturado
 *      (documentTitle + sections tipadas)
 *   3. Renderer SIGMA empilha as sections em layout editorial profissional
 *
 * O parametro `useBrandbook` da assinatura antiga e ignorado — mantido so
 * pra compat com chamadas existentes (endpoint /api/copy/export e UI).
 */
async function buildHtmlForExport({ sessionId, tenantId, template, useBrandbook }) {
  const { session, client } = await loadSessionContext(sessionId, tenantId);

  const { enrichForExport } = require('./exportEnricher');
  const enriched = await enrichForExport({
    copyText: session.output_text || '',
    template,
    clientName: client?.company_name || null,
    tenantId,
    sessionId,
    clientId: session.client_id || null,
  });

  const renderer = pickHtmlRenderer(template);
  return renderer({
    structured: enriched.structured,
    client,
  });
}

// ── Persistencia de arquivo ─────────────────────────────────────────────────

async function _writeFile(tenantId, jobId, ext, buffer) {
  const yyyymm = new Date().toISOString().slice(0, 7); // 2026-05
  const dir = path.join(EXPORT_ROOT, tenantId, yyyymm);
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${jobId}.${ext}`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, buffer);
  // URL publica relativa — Next serve `public/` direto na raiz
  const publicUrl = `/uploads/exports/${tenantId}/${yyyymm}/${fileName}`;
  return { publicUrl, fileSize: buffer.length };
}

// ── Notificacoes ────────────────────────────────────────────────────────────

async function _notifyDone(job) {
  try {
    await queryOne(
      `INSERT INTO system_notifications (tenant_id, type, title, message, client_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        job.tenant_id,
        'copy_export_done',
        'Export pronto',
        `Documento ${job.format.toUpperCase()} disponivel pra download.`,
        job.client_id,
        JSON.stringify({ jobId: job.id, sessionId: job.session_id, template: job.template, format: job.format, url: job.result_url }),
      ]
    );
    try { require('../../infra/cache').invalidate(`notif:count:${job.tenant_id}`); } catch {}
  } catch {}
}

async function _notifyError(job, errorMessage) {
  try {
    await queryOne(
      `INSERT INTO system_notifications (tenant_id, type, title, message, client_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        job.tenant_id,
        'copy_export_error',
        'Falha no export',
        (errorMessage || 'Erro desconhecido').slice(0, 240),
        job.client_id,
        JSON.stringify({ jobId: job.id, sessionId: job.session_id, template: job.template, format: job.format }),
      ]
    );
  } catch {}
}

// ── API pública (CRUD + processing) ────────────────────────────────────────

async function createExportJob({ tenantId, sessionId, clientId, template, format, useBrandbook }) {
  if (!['landing', 'planning', 'freeform'].includes(template)) {
    throw new Error('template invalido');
  }
  if (!['pdf', 'docx'].includes(format)) {
    throw new Error('format invalido');
  }
  return queryOne(
    `INSERT INTO copy_export_jobs (tenant_id, session_id, client_id, template, format, use_brandbook, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [tenantId, sessionId, clientId || null, template, format, useBrandbook !== false]
  );
}

async function getExportJob(jobId, tenantId) {
  return queryOne(
    `SELECT id, tenant_id, session_id, client_id, template, format, use_brandbook,
            status, result_url, result_size_bytes, error_message, duration_ms,
            created_at, started_at, finished_at
       FROM copy_export_jobs
      WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId]
  );
}

/**
 * Processa um job de export. Idempotente — se job nao esta pending,
 * retorna sem fazer nada.
 */
async function processExportJob(jobId) {
  const startedAtMs = Date.now();
  let job;
  try {
    job = await queryOne(
      `UPDATE copy_export_jobs
          SET status = 'running', started_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [jobId]
    );
    if (!job) {
      console.log('[INFO][exportJobRunner] job ja em outro estado, pulando', { jobId });
      return;
    }

    console.log('[INFO][exportJobRunner] start', { jobId, template: job.template, format: job.format });

    const html = await buildHtmlForExport({
      sessionId: job.session_id,
      tenantId: job.tenant_id,
      template: job.template,
      useBrandbook: job.use_brandbook,
    });

    let buffer;
    let ext;
    if (job.format === 'pdf') {
      const { renderHtmlToPdf } = require('../../infra/api/pdfRenderer');
      buffer = await renderHtmlToPdf(html);
      ext = 'pdf';
    } else {
      // DOCX: roda o mesmo enricher (cache hit do banco se possivel) e
      // entrega o JSON estruturado pro renderer DOCX que faz o parsing
      // pra Document/Paragraph com identidade SIGMA fixa.
      const { session, client } = await loadSessionContext(job.session_id, job.tenant_id);
      const { enrichForExport } = require('./exportEnricher');
      const enriched = await enrichForExport({
        copyText: session.output_text || '',
        template: job.template,
        clientName: client?.company_name || null,
        tenantId: job.tenant_id,
        sessionId: job.session_id,
        clientId: session.client_id || null,
      });
      const renderer = pickDocxRenderer(job.template);
      buffer = await renderer({
        structured: enriched.structured,
        client,
      });
      ext = 'docx';
    }

    const { publicUrl, fileSize } = await _writeFile(job.tenant_id, jobId, ext, buffer);
    const durationMs = Date.now() - startedAtMs;

    const updated = await queryOne(
      `UPDATE copy_export_jobs
          SET status = 'done', result_url = $2, result_size_bytes = $3,
              duration_ms = $4, finished_at = now()
        WHERE id = $1 RETURNING *`,
      [jobId, publicUrl, fileSize, durationMs]
    );
    await _notifyDone(updated);
    console.log('[SUCESSO][exportJobRunner] done', { jobId, fileSize, durationMs });

  } catch (err) {
    console.error('[ERRO][exportJobRunner]', { jobId, error: err.message, stack: err.stack?.split('\n').slice(0, 4).join('\n') });
    if (job) {
      try {
        await query(
          `UPDATE copy_export_jobs
              SET status = 'error', error_message = $2,
                  duration_ms = $3, finished_at = now()
            WHERE id = $1`,
          [jobId, (err.message || 'erro').slice(0, 1000), Date.now() - startedAtMs]
        );
        await _notifyError(job, err.message);
      } catch {}
    }
  }
}

/**
 * Cleanup: remove arquivos com mais de N dias e marca jobs como expirados.
 * Chamado pelo cron interno do worker (server/instrumentation.js — TODO F4).
 */
async function cleanupOldExports(maxAgeDays = 7) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 3600 * 1000).toISOString();
  const stale = await query(
    `SELECT id, tenant_id, result_url FROM copy_export_jobs
      WHERE status = 'done' AND finished_at < $1 AND result_url IS NOT NULL`,
    [cutoff]
  );

  let removed = 0;
  for (const row of stale) {
    if (!row.result_url) continue;
    const filePath = path.join(process.cwd(), 'public', row.result_url);
    try { await fs.unlink(filePath); removed += 1; } catch {}
  }
  await query(
    `UPDATE copy_export_jobs SET result_url = NULL
      WHERE status = 'done' AND finished_at < $1`,
    [cutoff]
  );
  console.log('[INFO][exportJobRunner] cleanup', { removed, total: stale.length });
  return { removed, total: stale.length };
}

module.exports = {
  createExportJob,
  getExportJob,
  processExportJob,
  buildHtmlForExport,
  cleanupOldExports,
};
