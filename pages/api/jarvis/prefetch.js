/**
 * GET /api/jarvis/prefetch
 * Aquece o cache do context snapshot do JARVIS.
 * Chamado pelo DashboardLayout ao montar — garante que o cache
 * esteja pronto quando o usuario abrir o orb.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';

const { buildContextSnapshot } = require('../../../models/jarvis/context');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false });
  }
  try {
    const tenantId = await resolveTenantId(req);
    await buildContextSnapshot(tenantId);
    return res.json({ success: true });
  } catch {
    return res.json({ success: false });
  }
}
