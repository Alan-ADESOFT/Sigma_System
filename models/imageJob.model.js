/**
 * @fileoverview Model de jobs de geração de imagem
 * @description CRUD da tabela image_jobs.
 * Lifecycle: queued → running → done | error | cancelled.
 * Soft delete via deleted_at.
 *
 * Convenções:
 *   · TODA query filtra por tenant_id quando há tenantId disponível.
 *   · listJobs faz UMA query com LEFT JOINs (sem N+1).
 *   · markStarted/markCompleted/markError são UPDATEs atômicos.
 */

const { query, queryOne } = require('../infra/db');

/**
 * Cria um novo job (status='queued' por default no schema).
 *
 * Sprint v1.1 — abril 2026: aceita referenceImageMetadata (refs com modo)
 * + parent_job_id/step_index/step_purpose pra pipelines multi-step.
 *
 * @param {object} data
 * @param {string} data.tenantId
 * @param {string} [data.clientId]
 * @param {string} [data.folderId]
 * @param {string} data.userId
 * @param {string} data.format
 * @param {string} data.aspectRatio
 * @param {number} [data.width]
 * @param {number} [data.height]
 * @param {string} data.model
 * @param {string} data.provider
 * @param {string} [data.brandbookId]
 * @param {boolean} [data.brandbookUsed=false]
 * @param {string} [data.templateId]
 * @param {string} data.rawDescription
 * @param {string} [data.observations]
 * @param {string} [data.negativePrompt]
 * @param {Array<string>} [data.referenceImageUrls] - LEGADO (lista plana)
 * @param {Array<{url, mode}>} [data.referenceImageMetadata] - novo (com modo)
 * @param {string} [data.parentJobId] - pra multi-step
 * @param {number} [data.stepIndex]
 * @param {string} [data.stepPurpose]
 * @returns {Promise<object>} job criado
 */
async function createJob(data) {
  const {
    tenantId, clientId, folderId, userId,
    format, aspectRatio, width, height,
    model, provider,
    brandbookId, brandbookUsed,
    templateId,
    rawDescription, observations, negativePrompt,
    referenceImageUrls,
    referenceImageMetadata,
    parentJobId, stepIndex, stepPurpose,
    bypassCache,
  } = data;

  if (!tenantId || !userId || !format || !aspectRatio || !model || !provider || !rawDescription) {
    throw new Error('createJob: campos obrigatórios faltando');
  }

  return queryOne(
    `INSERT INTO image_jobs
       (tenant_id, client_id, folder_id, user_id,
        format, aspect_ratio, width, height,
        model, provider,
        brandbook_id, brandbook_used,
        template_id,
        raw_description, observations, negative_prompt,
        reference_image_urls, reference_image_metadata,
        parent_job_id, step_index, step_purpose,
        bypass_cache)
     VALUES ($1, $2, $3, $4,
             $5, $6, $7, $8,
             $9, $10,
             $11, $12,
             $13,
             $14, $15, $16,
             $17, $18,
             $19, $20, $21,
             $22)
     RETURNING *`,
    [
      tenantId, clientId || null, folderId || null, userId,
      format, aspectRatio, width || null, height || null,
      model, provider,
      brandbookId || null, !!brandbookUsed,
      templateId || null,
      rawDescription, observations || null, negativePrompt || null,
      JSON.stringify(referenceImageUrls || []),
      JSON.stringify(referenceImageMetadata || []),
      parentJobId || null,
      typeof stepIndex === 'number' ? stepIndex : 0,
      stepPurpose || null,
      !!bypassCache,
    ]
  );
}

/**
 * Atualiza status + qualquer subset de campos.
 * @param {string} id
 * @param {string} status
 * @param {object} [fields]
 */
async function updateJobStatus(id, status, fields = {}) {
  const sets = ['status = $2'];
  const params = [id, status];

  const map = {
    optimizedPrompt:     'optimized_prompt',
    promptHash:          'prompt_hash',
    resultImageUrl:      'result_image_url',
    resultThumbnailUrl:  'result_thumbnail_url',
    resultMetadata:      'result_metadata',
    errorMessage:        'error_message',
    errorCode:           'error_code',
    durationMs:          'duration_ms',
    tokensInput:         'tokens_input',
    tokensOutput:        'tokens_output',
    costUsd:             'cost_usd',
    startedAt:           'started_at',
    completedAt:         'completed_at',
    // Sprint v1.1 — abril 2026
    title:               'title',
    titleUserEdited:     'title_user_edited',
    smartDecision:       'smart_decision',
    timedOut:            'timed_out',
    model:               'model',
    provider:            'provider',
  };

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (fields[jsKey] === undefined) continue;
    let val = fields[jsKey];
    if (jsKey === 'resultMetadata' || jsKey === 'smartDecision') {
      val = JSON.stringify(val || (jsKey === 'smartDecision' ? null : {}));
    }
    params.push(val);
    sets.push(`${dbCol} = $${params.length}`);
  }

  return queryOne(
    `UPDATE image_jobs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
}

/**
 * Busca por ID. Filtra por tenantId quando passado.
 */
async function getJobById(id, tenantId) {
  if (tenantId) {
    return queryOne(
      `SELECT j.*,
              u.name AS user_name, u.email AS user_email,
              c.company_name AS client_name,
              f.name AS folder_name
         FROM image_jobs j
         LEFT JOIN tenants u ON u.id = j.user_id
         LEFT JOIN marketing_clients c ON c.id = j.client_id
         LEFT JOIN image_folders f ON f.id = j.folder_id
        WHERE j.id = $1 AND j.tenant_id = $2`,
      [id, tenantId]
    );
  }
  return queryOne(
    `SELECT * FROM image_jobs WHERE id = $1`,
    [id]
  );
}

/**
 * Lista jobs com filtros + JOINs em users/clients/folders (UMA query).
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.userId]
 * @param {string} [opts.clientId]
 * @param {string} [opts.folderId]
 * @param {string} [opts.status]
 * @param {boolean} [opts.starredOnly]
 * @param {number} [opts.limit=20]
 * @param {number} [opts.offset=0]
 */
async function listJobs(opts = {}) {
  const {
    tenantId, userId, clientId, folderId, status,
    starredOnly, limit = 20, offset = 0,
  } = opts;
  if (!tenantId) throw new Error('listJobs: tenantId obrigatório');

  const where = ['j.tenant_id = $1', 'j.deleted_at IS NULL'];
  const params = [tenantId];

  if (userId)    { params.push(userId);    where.push(`j.user_id = $${params.length}`); }
  if (clientId)  { params.push(clientId);  where.push(`j.client_id = $${params.length}`); }
  if (folderId === null) {
    where.push(`j.folder_id IS NULL`);
  } else if (folderId) {
    params.push(folderId);
    where.push(`j.folder_id = $${params.length}`);
  }
  if (status)    { params.push(status);    where.push(`j.status = $${params.length}`); }
  if (starredOnly) where.push(`j.is_starred = true`);

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  return query(
    `SELECT j.id, j.status, j.format, j.aspect_ratio, j.width, j.height,
            j.model, j.provider,
            j.raw_description, j.optimized_prompt, j.observations,
            j.result_image_url, j.result_thumbnail_url, j.result_metadata,
            j.error_message, j.error_code,
            j.duration_ms, j.cost_usd,
            j.brandbook_id, j.brandbook_used, j.template_id,
            j.is_template_saved, j.is_starred,
            j.created_at, j.started_at, j.completed_at,
            j.user_id, u.name AS user_name,
            j.client_id, c.company_name AS client_name,
            j.folder_id, f.name AS folder_name
       FROM image_jobs j
       LEFT JOIN tenants u ON u.id = j.user_id
       LEFT JOIN marketing_clients c ON c.id = j.client_id
       LEFT JOIN image_folders f ON f.id = j.folder_id
      WHERE ${where.join(' AND ')}
      ORDER BY j.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );
}

/**
 * Conta total de jobs (mesmos filtros que listJobs, sem limit/offset).
 * Útil pra paginação.
 */
async function countJobs(opts = {}) {
  const { tenantId, userId, clientId, folderId, status, starredOnly } = opts;
  if (!tenantId) throw new Error('countJobs: tenantId obrigatório');

  const where = ['tenant_id = $1', 'deleted_at IS NULL'];
  const params = [tenantId];

  if (userId)   { params.push(userId);   where.push(`user_id = $${params.length}`); }
  if (clientId) { params.push(clientId); where.push(`client_id = $${params.length}`); }
  if (folderId === null) where.push(`folder_id IS NULL`);
  else if (folderId) { params.push(folderId); where.push(`folder_id = $${params.length}`); }
  if (status)   { params.push(status);   where.push(`status = $${params.length}`); }
  if (starredOnly) where.push(`is_starred = true`);

  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM image_jobs WHERE ${where.join(' AND ')}`,
    params
  );
  return row?.n || 0;
}

/**
 * Busca optimized_prompt em cache pela hash MD5 (rolling window por horas).
 * Usado pelo Prompt Engineer para evitar gastar tokens em prompts repetidos.
 *
 * @param {string} hash
 * @param {string} tenantId
 * @param {number} [hoursWindow=24]
 */
async function searchByPromptHash(hash, tenantId, hoursWindow = 24) {
  if (!hash) return null;
  return queryOne(
    `SELECT optimized_prompt, prompt_hash, model, format, brandbook_id, created_at
       FROM image_jobs
      WHERE prompt_hash = $1
        AND tenant_id = $2
        AND optimized_prompt IS NOT NULL
        AND deleted_at IS NULL
        AND created_at > now() - ($3 || ' hours')::interval
      ORDER BY created_at DESC
      LIMIT 1`,
    [hash, tenantId, String(hoursWindow)]
  );
}

/**
 * Soft delete (preserva o registro para auditoria/cleanup).
 */
async function softDeleteJob(id, tenantId) {
  const row = await queryOne(
    `UPDATE image_jobs
        SET deleted_at = now()
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      RETURNING id, result_image_url, result_thumbnail_url`,
    [id, tenantId]
  );
  return row;
}

/**
 * Retorna jobs em queued ou running (para o worker / concurrent check).
 * @param {number} [limit=5]
 */
async function getQueuedJobs(limit = 5) {
  return query(
    `SELECT * FROM image_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT $1`,
    [limit]
  );
}

/**
 * Conta jobs ativos (queued + running) de um tenant — usado no concurrent check.
 */
async function countActiveJobs(tenantId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM image_jobs
      WHERE tenant_id = $1 AND status IN ('queued','running')`,
    [tenantId]
  );
  return row?.n || 0;
}

/**
 * Conta jobs criados por user em janela rolante (em horas).
 * @param {string} userId
 * @param {number} hours
 */
async function countJobsByUserInWindow(userId, hours) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM image_jobs
      WHERE user_id = $1 AND created_at > now() - ($2 || ' hours')::interval`,
    [userId, String(hours)]
  );
  return row?.n || 0;
}

/**
 * Atalhos de transição de estado.
 */
async function markStarted(id) {
  return updateJobStatus(id, 'running', { startedAt: new Date().toISOString() });
}

async function markCompleted(id, data = {}) {
  return updateJobStatus(id, 'done', {
    ...data,
    completedAt: new Date().toISOString(),
  });
}

async function markError(id, err) {
  const code = err?.code || 'PROVIDER_ERROR';
  return updateJobStatus(id, 'error', {
    errorMessage: err?.message?.slice(0, 1000) || 'Erro desconhecido',
    errorCode: code,
    completedAt: new Date().toISOString(),
  });
}

async function markCancelled(id) {
  return updateJobStatus(id, 'cancelled', {
    completedAt: new Date().toISOString(),
  });
}

/**
 * Toggle de favorito.
 */
async function toggleStar(id, tenantId) {
  return queryOne(
    `UPDATE image_jobs
        SET is_starred = NOT is_starred
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, is_starred`,
    [id, tenantId]
  );
}

/**
 * Histórico admin: TODOS os jobs do tenant nos últimos N dias com JOINs.
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {number} [opts.days=7]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 */
async function getRecentJobsAdmin(opts) {
  const { tenantId, days = 7, limit = 100, offset = 0 } = opts;
  if (!tenantId) throw new Error('getRecentJobsAdmin: tenantId obrigatório');

  return query(
    `SELECT j.id, j.status, j.format, j.model, j.provider,
            j.raw_description, j.result_image_url, j.result_thumbnail_url,
            j.error_message, j.error_code,
            j.tokens_input, j.tokens_output, j.cost_usd,
            j.duration_ms, j.created_at, j.completed_at,
            j.user_id, u.name AS user_name, u.email AS user_email,
            j.client_id, c.company_name AS client_name
       FROM image_jobs j
       LEFT JOIN tenants u ON u.id = j.user_id
       LEFT JOIN marketing_clients c ON c.id = j.client_id
      WHERE j.tenant_id = $1
        AND j.created_at > now() - ($2 || ' days')::interval
      ORDER BY j.created_at DESC
      LIMIT $3 OFFSET $4`,
    [tenantId, String(days), limit, offset]
  );
}

/**
 * Marca job como salvo em template (flag is_template_saved).
 */
async function markAsTemplateSaved(id, tenantId) {
  return queryOne(
    `UPDATE image_jobs SET is_template_saved = true
      WHERE id = $1 AND tenant_id = $2
      RETURNING id`,
    [id, tenantId]
  );
}

/**
 * Atualiza o título de um job (manual via UI ou auto via title generator).
 * Marca title_user_edited=true quando vem do user pra não sobrescrever depois.
 *
 * @param {string} id
 * @param {string} tenantId
 * @param {string} title
 * @param {boolean} [userEdited=true] - false quando o gerador automático seta
 */
async function updateJobTitle(id, tenantId, title, userEdited = true) {
  return queryOne(
    `UPDATE image_jobs
        SET title = $3, title_user_edited = $4
      WHERE id = $1 AND tenant_id = $2
      RETURNING id, title, title_user_edited`,
    [id, tenantId, String(title || '').slice(0, 200), !!userEdited]
  );
}

/**
 * Conta jobs ativos GLOBAIS (todos os tenants) — usado pelo limite global
 * de 5 jobs concorrentes do worker v1.1.
 */
async function countActiveJobsGlobal() {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM image_jobs WHERE status IN ('queued','running')`
  );
  return row?.n || 0;
}

module.exports = {
  createJob,
  updateJobStatus,
  updateJobTitle,
  getJobById,
  listJobs,
  countJobs,
  searchByPromptHash,
  softDeleteJob,
  getQueuedJobs,
  countActiveJobs,
  countActiveJobsGlobal,
  countJobsByUserInWindow,
  markStarted,
  markCompleted,
  markError,
  markCancelled,
  toggleStar,
  getRecentJobsAdmin,
  markAsTemplateSaved,
};
