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

    // Token deve estar 'pending' para submeter
    const result = await validateToken(token);
    if (!result.valid) {
      console.log('[INFO][API:/api/form/submit] Token inválido para submissão', { reason: result.reason });
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado', reason: result.reason });
    }

    const { id: tokenId, client_id: clientId, tenant_id: tenantId, company_name } = result.tokenData;

    // Submete o formulário (salva dados + marca token como usado)
    await submitForm(tokenId, clientId, tenantId, data);

    // Atualiza campos básicos do cliente com dados vindos do formulário
    // Os campos dependem das chaves usadas no wizard — adaptar conforme as perguntas
    const updates = {};
    if (data['1.1']) updates.company_name = data['1.1'];
    if (data['1.2']) updates.niche = data['1.2'];
    if (data['1.3']) updates.main_product = data['1.3'];
    if (data['1.4']) updates.product_description = data['1.4'];
    if (data['1.5']) updates.email = data['1.5'];
    if (data['1.6']) updates.phone = data['1.6'];

    const fields = Object.keys(updates);
    if (fields.length > 0) {
      const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const vals = fields.map(f => updates[f]);
      await query(
        `UPDATE marketing_clients SET ${sets}, updated_at = now() WHERE id = $1`,
        [clientId, ...vals]
      );
      console.log('[INFO][API:/api/form/submit] Dados do cliente atualizados', { clientId, fields });
    }

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
