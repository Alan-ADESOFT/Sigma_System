/**
 * @fileoverview GET /api/image/_brandbook-test/[clientId] — admin only
 * @description Mostra exatamente o que SERIA injetado no prompt em uma
 * geração desse cliente. Útil pra validar manualmente "o brandbook X tá
 * pegando ou não?".
 *
 * Sprint v1.1 — abril 2026 — atende request explícito do user de garantir
 * que brandbook está sendo injetado em toda geração.
 *
 * Retorna:
 *   · brandbook ativo (estruturado)
 *   · fixed refs e suas descrições (cache state)
 *   · resumo do que vai pro prompt
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../../lib/api-auth');
const { getActiveBrandbook } = require('../../../../models/brandbook.model');

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
  if (!isAdmin(user)) {
    return res.status(403).json({ success: false, error: 'Apenas admin pode acessar' });
  }
  const tenantId = await resolveTenantId(req);
  const { clientId } = req.query;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  const brandbook = await getActiveBrandbook(clientId, tenantId);
  if (!brandbook) {
    return res.json({
      success: true,
      data: {
        hasBrandbook: false,
        message: 'Nenhum brandbook ativo encontrado pra este cliente. Gerações deste cliente NÃO terão brandbook injetado.',
      },
    });
  }

  // Parse com tolerância
  const sd = (() => {
    try {
      return typeof brandbook.structured_data === 'string'
        ? JSON.parse(brandbook.structured_data)
        : (brandbook.structured_data || {});
    } catch { return {}; }
  })();

  const fixedRefs = (() => {
    try {
      return Array.isArray(brandbook.fixed_references)
        ? brandbook.fixed_references
        : JSON.parse(brandbook.fixed_references || '[]');
    } catch { return []; }
  })();

  const fixedDescriptions = (() => {
    try {
      return Array.isArray(brandbook.fixed_references_descriptions)
        ? brandbook.fixed_references_descriptions
        : JSON.parse(brandbook.fixed_references_descriptions || '[]');
    } catch { return []; }
  })();

  const sectionsAdded = Object.keys(sd).filter(k => {
    const v = sd[k];
    return v && (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
  });

  return res.json({
    success: true,
    data: {
      hasBrandbook: true,
      brandbookId: brandbook.id,
      source: brandbook.source,
      isActive: brandbook.is_active,
      structuredData: sd,
      sectionsAdded,
      fixedRefs,
      fixedRefsDescriptions: fixedDescriptions,
      fixedRefsDescribedAt: brandbook.fixed_references_described_at,
      fixedRefsCacheValid: (() => {
        if (fixedRefs.length === 0) return true;
        if (fixedDescriptions.length !== fixedRefs.length) return false;
        if (!brandbook.fixed_references_described_at) return false;
        const ageMs = Date.now() - new Date(brandbook.fixed_references_described_at).getTime();
        return ageMs < 30 * 24 * 60 * 60 * 1000;
      })(),
      summary: {
        // O que VAI ser injetado em cada geração:
        brandIdentityWillBeInjected: !!brandbook && sectionsAdded.length > 0,
        fixedAssetsWillBeInjected: fixedRefs.length > 0,
        message: `Em cada geração deste cliente: BRAND IDENTITY com ${sectionsAdded.length} seções (${sectionsAdded.join(', ')}) + ${fixedRefs.length} fixed assets serão injetados no prompt.`,
      },
    },
  });
}
