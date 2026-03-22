/**
 * pages/api/form/mark-started.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Marca o token como 'in_progress' quando o cliente clica "Vamos".
 * Impede que outro navegador/dispositivo acesse o mesmo formulário.
 *
 * POST — Body: { token }
 * Retorna: { success }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query } from '../../../infra/db';
import { validateToken } from '../../../models/clientForm';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token é obrigatório' });
    }

    const result = await validateToken(token);

    // Aceita tanto 'pending' quanto 'in_progress' (mesmo cliente voltando)
    if (!result.valid && result.reason !== 'valid') {
      // Se o token está in_progress, aceita normalmente
      if (result.tokenData?.status === 'in_progress') {
        return res.json({ success: true });
      }
      return res.status(403).json({ success: false, reason: result.reason });
    }

    // Marca como in_progress
    await query(
      `UPDATE client_form_tokens SET status = 'in_progress', updated_at = now() WHERE id = $1`,
      [result.tokenData.id]
    );

    console.log('[SUCESSO][API:mark-started] Token marcado como in_progress', { tokenId: result.tokenData.id });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:mark-started]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
