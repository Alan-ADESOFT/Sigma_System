/**
 * pages/api/form/save-draft.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Salva rascunho do formulário — rota pública (sem autenticação).
 * Chamada automaticamente pelo wizard a cada troca de etapa ou intervalo.
 *
 * POST — Body: { token, data, currentStep }
 * Retorna: { success, savedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { validateToken, upsertDraft } from '../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/save-draft] Requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token, data, currentStep } = req.body;

    if (!token || !data) {
      return res.status(400).json({ success: false, error: 'Token e data são obrigatórios' });
    }

    // Valida que o token ainda está ativo (pending ou in_progress)
    const result = await validateToken(token);
    const canSave = result.valid || result.reason === 'in_progress';
    if (!canSave) {
      console.log('[INFO][API:/api/form/save-draft] Token inválido para salvar rascunho', { reason: result.reason });
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado', reason: result.reason });
    }

    const { id: tokenId, client_id: clientId, tenant_id: tenantId } = result.tokenData;
    const row = await upsertDraft(tokenId, clientId, tenantId, data, currentStep || 1);

    console.log('[SUCESSO][API:/api/form/save-draft] Rascunho salvo', { tokenId, currentStep });
    return res.json({
      success: true,
      savedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/form/save-draft] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
