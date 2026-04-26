/**
 * pages/api/content-planning/plans/[id]/versions/[vid].js
 *   GET    → retorna versão completa (com snapshot)
 *   POST   → restaura versão (cria snapshot de seguranca antes)
 *   DELETE → remove a versão do histórico
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const versionModel = require('../../../../../../models/contentPlanning/version');
const { queryOne } = require('../../../../../../infra/db');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: planId, vid } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!planId || !vid) return res.status(400).json({ success: false, error: 'id e vid obrigatorios' });

  try {
    // Sanity check: plano pertence ao tenant
    const plan = await queryOne(
      'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
      [planId, tenantId]
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

    if (req.method === 'GET') {
      const version = await versionModel.getVersionById(vid, tenantId);
      if (!version || version.plan_id !== planId) {
        return res.status(404).json({ success: false, error: 'Versao nao encontrada' });
      }
      return res.json({ success: true, version });
    }

    if (req.method === 'POST') {
      const restored = await versionModel.restoreVersion(vid, tenantId, userId);
      return res.json({ success: true, plan: restored });
    }

    if (req.method === 'DELETE') {
      // Verifica antes que a versão pertence ao plano informado
      const version = await versionModel.getVersionById(vid, tenantId);
      if (!version || version.plan_id !== planId) {
        return res.status(404).json({ success: false, error: 'Versao nao encontrada' });
      }
      const ok = await versionModel.deleteVersion(vid, tenantId);
      if (!ok) return res.status(404).json({ success: false, error: 'Versao nao encontrada' });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    if (err.message === 'version_not_found') {
      return res.status(404).json({ success: false, error: 'Versao nao encontrada' });
    }
    console.error('[ERRO][API:content-planning/plans/[id]/versions/[vid]]', { planId, vid, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
