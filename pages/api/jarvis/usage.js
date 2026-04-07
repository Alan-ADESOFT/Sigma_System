/**
 * @fileoverview GET /api/jarvis/usage
 * Retorna { today_count, remaining, limit, history, stats } para o usuário logado.
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { verifyToken } from '../../../lib/auth';
import { queryOne } from '../../../infra/db';
import { checkJarvisQuota, getRecentUsage, getTodayStats } from '../../../models/jarvis/rateLimit';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Método não permitido' });

  const session = verifyToken(req.cookies?.sigma_token);
  if (!session) return res.status(401).json({ success: false, error: 'Não autenticado.' });

  try {
    const tenantId = await resolveTenantId(req);
    const user = await queryOne(`SELECT id, name, role FROM tenants WHERE id = $1`, [session.userId]);
    if (!user) return res.status(401).json({ success: false, error: 'Sessão inválida.' });

    const quota   = await checkJarvisQuota(tenantId, user.id, user.role);
    const history = await getRecentUsage(tenantId, user.id, 10);
    const stats   = await getTodayStats(tenantId, user.id);

    return res.json({
      success: true,
      today_count: quota.used,
      remaining:   quota.remaining,
      limit:       quota.limit,
      role:        user.role,
      history,
      stats,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/jarvis/usage]', { error: err.message });
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
}
