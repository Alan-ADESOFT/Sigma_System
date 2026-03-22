/**
 * pages/api/form/send-whatsapp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Envia a mensagem do formulário via Z-API (WhatsApp) para o cliente.
 * Recebe a mensagem já editada pelo operador no popup.
 *
 * POST — Body: { clientId, phone, message }
 * Retorna: { success, messageId }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { getClientById } from '../../../models/client.model';
import { createNotification } from '../../../models/clientForm';
const { sendText } = require('../../../infra/api/zapi');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/form/send-whatsapp] Requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const { clientId, phone, message } = req.body;

    if (!clientId || !phone || !message) {
      return res.status(400).json({ success: false, error: 'clientId, phone e message são obrigatórios' });
    }

    // Confirma que o cliente existe
    const client = await getClientById(clientId, tenantId);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Envia via Z-API
    const result = await sendText(phone, message, { delayTyping: 3 });

    // Cria notificação de sucesso
    await createNotification(
      tenantId,
      'form_sent',
      'Formulário enviado via WhatsApp',
      `Link do formulário enviado para ${client.company_name} via WhatsApp.`,
      clientId,
      { messageId: result.messageId, sentAt: new Date().toISOString() }
    );

    console.log('[SUCESSO][API:/api/form/send-whatsapp] Mensagem enviada', {
      clientId,
      messageId: result.messageId,
    });

    return res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    console.error('[ERRO][API:/api/form/send-whatsapp] Erro no envio', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Falha ao enviar WhatsApp. Verifique se o número está correto e se a instância Z-API está conectada.',
    });
  }
}
