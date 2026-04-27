/**
 * @fileoverview /api/image/brandbook/[clientId]/fixed-refs
 *   GET — retorna o array fixed_references do brandbook ativo
 *   PUT — substitui o array todo (após validação de URLs e labels)
 *
 * Sprint v1.1 — abril 2026: até 5 imagens da marca que SEMPRE são injetadas
 * como contexto visual em toda geração desse cliente.
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const {
  getActiveBrandbook,
  updateFixedReferences,
} = require('../../../../../models/brandbook.model');
const { logAudit } = require('../../../../../models/imageAudit.model');

export default async function handler(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  const active = await getActiveBrandbook(clientId, tenantId);
  if (!active) {
    return res.status(404).json({ success: false, error: 'Brandbook ativo não encontrado' });
  }

  if (req.method === 'GET') {
    let fixedRefs = [];
    let descriptions = [];
    try {
      fixedRefs = Array.isArray(active.fixed_references)
        ? active.fixed_references
        : JSON.parse(active.fixed_references || '[]');
    } catch { fixedRefs = []; }
    try {
      descriptions = Array.isArray(active.fixed_references_descriptions)
        ? active.fixed_references_descriptions
        : JSON.parse(active.fixed_references_descriptions || '[]');
    } catch { descriptions = []; }
    return res.json({
      success: true,
      data: {
        brandbookId: active.id,
        fixedRefs,
        descriptions,
        describedAt: active.fixed_references_described_at,
      },
    });
  }

  if (req.method === 'PUT') {
    const { fixedRefs } = req.body || {};
    if (!Array.isArray(fixedRefs)) {
      return res.status(400).json({ success: false, error: 'fixedRefs deve ser array' });
    }
    try {
      const updated = await updateFixedReferences(active.id, tenantId, fixedRefs);
      await logAudit({
        tenantId, userId: user.id, req,
        action: 'brandbook_fixed_refs_updated',
        details: { brandbookId: active.id, count: fixedRefs.length },
      });
      return res.json({ success: true, data: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Método não permitido' });
}
