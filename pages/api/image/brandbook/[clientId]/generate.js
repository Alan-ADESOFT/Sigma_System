/**
 * @fileoverview POST /api/image/brandbook/:clientId/generate
 * @description Usuário descreve a marca em texto livre e a IA gera o
 * brandbook completo (paleta, tipografia, tom, etc). Igual ao /extract,
 * NÃO persiste — retorna o JSON para revisão.
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const { generateFromDescription } = require('../../../../../models/agentes/imagecreator/brandbookExtractor');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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
  const { clientId } = req.query;
  const { description } = req.body || {};

  if (!description || description.length < 30) {
    return res.status(400).json({
      success: false,
      error: 'description obrigatória e precisa ter pelo menos 30 caracteres',
    });
  }

  try {
    const result = await generateFromDescription({
      description, tenantId, userId: user.id, clientId,
    });
    return res.json({
      success: true,
      data: {
        structured_data: result.structuredData,
        tokens: { input: result.tokensInput, output: result.tokensOutput },
        model_used: result.modelUsed,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:image/brandbook/generate]', { error: err.message });
    return res.status(400).json({ success: false, error: err.message });
  }
}
