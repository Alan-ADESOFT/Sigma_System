/**
 * pages/api/form/submit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Submissão final do formulário — rota pública (sem autenticação).
 * Marca token como usado, salva respostas e atualiza dados do cliente.
 *
 * POST — Body: { token, data }
 * Retorna: { success, message }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query } from '../../../infra/db';
import { validateToken, submitForm, createNotification } from '../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/submit] Requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const { token, data } = req.body;

    if (!token || !data) {
      return res.status(400).json({ success: false, error: 'Token e data são obrigatórios' });
    }

    // Token deve estar 'pending' ou 'in_progress' para submeter
    const result = await validateToken(token);
    const canSubmit = result.valid || result.reason === 'in_progress';
    if (!canSubmit) {
      console.log('[INFO][API:/api/form/submit] Token inválido para submissão', { reason: result.reason });
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado', reason: result.reason });
    }

    const { id: tokenId, client_id: clientId, tenant_id: tenantId, company_name } = result.tokenData;

    // Submete o formulário (salva dados + marca token como usado)
    await submitForm(tokenId, clientId, tenantId, data);

    // Marca form_done = true no cliente (fonte de verdade para aba Respostas)
    await query(
      `UPDATE marketing_clients SET form_done = true, updated_at = now() WHERE id = $1`,
      [clientId]
    );

    // Notifica o operador
    await createNotification(
      tenantId,
      'form_submitted',
      'Formulário preenchido',
      `${company_name || 'Cliente'} acabou de enviar o formulário de briefing.`,
      clientId,
      { submittedAt: new Date().toISOString() }
    );

    console.log('[SUCESSO][API:/api/form/submit] Formulário submetido com sucesso', { clientId });
    return res.json({ success: true, message: 'Formulário enviado com sucesso!' });
  } catch (err) {
    console.error('[ERRO][API:/api/form/submit] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
