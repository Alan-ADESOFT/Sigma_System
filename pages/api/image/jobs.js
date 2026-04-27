/**
 * @fileoverview GET /api/image/jobs — lista jobs com filtros e paginação
 * @description Filtros: clientId, folderId (incluindo "null" para sem pasta),
 * status, starred, scopeUser (lista só os do user logado se 'true').
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const { listJobs, countJobs } = require('../../../models/imageJob.model');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);

  const {
    clientId, folderId, status,
    starred, scopeUser,
    parentJobId,
    limit, offset,
  } = req.query;

  const opts = {
    tenantId,
    userId:    scopeUser === 'true' ? user.id : undefined,
    clientId:  clientId || undefined,
    folderId:  folderId === 'null' ? null : (folderId || undefined),
    status:    status || undefined,
    starredOnly: starred === 'true',
    parentJobId: parentJobId || undefined,  // v1.2: lista versões do mesmo lineage
    limit:     Math.min(Math.max(parseInt(limit) || 20, 1), 100),
    offset:    Math.max(parseInt(offset) || 0, 0),
  };

  try {
    const [items, total] = await Promise.all([
      listJobs(opts),
      countJobs(opts),
    ]);
    console.log('[INFO][API:image/jobs] listagem', {
      tenantId, count: items.length, total, opts,
    });
    return res.json({
      success: true,
      data: items,
      pagination: {
        total, limit: opts.limit, offset: opts.offset,
        hasMore: opts.offset + items.length < total,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:image/jobs]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
