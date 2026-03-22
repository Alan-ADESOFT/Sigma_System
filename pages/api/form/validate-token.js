/**
 * pages/api/form/validate-token.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Valida um token de formulário — rota pública (sem autenticação).
 * Chamada pelo frontend do formulário ao carregar a página /form/[token].
 *
 * GET — Query: ?token=xxx
 * Retorna: { success, client?, draft?, reason? }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { validateToken, getDraft } from '../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/validate-token] Requisição recebida', { method: req.method });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token é obrigatório' });
    }

    const result = await validateToken(token);

    if (!result.valid) {
      console.log('[INFO][API:/api/form/validate-token] Token inválido', { reason: result.reason });
      return res.json({ success: false, reason: result.reason });
    }

    // Token válido — busca rascunho existente (se o cliente já começou a preencher)
    const draft = await getDraft(result.tokenData.id);

    console.log('[SUCESSO][API:/api/form/validate-token] Token válido', {
      clientId: result.tokenData.client_id,
      hasDraft: !!draft,
    });

    return res.json({
      success: true,
      client: {
        id: result.tokenData.client_id,
        company_name: result.tokenData.company_name,
      },
      draft: draft ? {
        data: draft.data,
        currentStep: draft.current_step,
        status: draft.status,
      } : null,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/form/validate-token] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
