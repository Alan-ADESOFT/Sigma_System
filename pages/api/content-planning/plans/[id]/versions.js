/**
 * pages/api/content-planning/plans/[id]/versions.js
 *   GET    → lista versoes (sem snapshot — só metadados)
 *   POST   → cria snapshot manual { label?, trigger?='manual' }
 *   DELETE → limpa TODAS as versões do plano (incluindo automáticas)
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const versionModel = require('../../../../../models/contentPlanning/version');
const { queryOne } = require('../../../../../infra/db');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: planId } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!planId) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    // Confirma que o plano pertence ao tenant
    const plan = await queryOne(
      'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
      [planId, tenantId]
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

    if (req.method === 'GET') {
      const versions = await versionModel.listVersions(planId, tenantId);
      return res.json({ success: true, versions });
    }

    if (req.method === 'POST') {
      const { label, trigger } = req.body || {};
      const version = await versionModel.createVersion(tenantId, planId, {
        label: label || null,
        trigger: trigger || 'manual',
        createdBy: userId,
      });
      return res.status(201).json({
        success: true,
        version: { id: version.id, version_no: version.version_no, label: version.label, trigger: version.trigger, created_at: version.created_at },
      });
    }

    if (req.method === 'DELETE') {
      const removed = await versionModel.clearAllVersions(planId, tenantId);
      return res.json({ success: true, removed });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/plans/[id]/versions]', { planId, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
