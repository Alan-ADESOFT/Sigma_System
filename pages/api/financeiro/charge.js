/**
 * pages/api/financeiro/charge.js
 * Cobrança MANUAL de uma parcela via WhatsApp (Z-API).
 *
 * Disparada pelo botão COBRAR → popup com a mensagem (editável). O texto final
 * vem do popup; aqui só validamos, enviamos e logamos. A cobrança automática
 * por cron está desligada (finance_bot_auto_charge_enabled).
 *
 * @route POST /api/financeiro/charge
 * @auth  requireAuth (qualquer usuário do workspace — Financeiro é compartilhado)
 * body: { installmentId, message, channel: 'personal'|'group' }
 */

import { queryOne } from '../../../infra/db';
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const { sendText } = require('../../../infra/api/zapi');
const { logCharge } = require('../../../models/financeChargeLog.model');
const { createNotification } = require('../../../models/clientForm');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    return res.status(500).json({ success: false, error: err.message });
  }
  const tenantId = user.tenant_id;

  try {
    const { installmentId, message, channel } = req.body || {};
    if (!installmentId || !message || !String(message).trim()) {
      return res.status(400).json({ success: false, error: 'installmentId e message são obrigatórios' });
    }
    const ch = channel === 'group' ? 'group' : 'personal';

    const inst = await queryOne(
      `SELECT ci.id, ci.client_id, mc.company_name, mc.phone, mc.whatsapp_group_id
         FROM client_installments ci
         JOIN marketing_clients mc ON mc.id = ci.client_id
        WHERE ci.id = $1 AND mc.tenant_id = $2`,
      [installmentId, tenantId]
    );
    if (!inst) return res.status(404).json({ success: false, error: 'Parcela não encontrada' });

    const target = ch === 'group' ? inst.whatsapp_group_id : inst.phone;
    if (!target) {
      return res.status(400).json({
        success: false,
        error: ch === 'group' ? 'Cliente sem grupo de WhatsApp cadastrado' : 'Cliente sem telefone cadastrado',
      });
    }

    // stage único por envio (manual_<timestamp>) — permite recobrar a mesma
    // parcela várias vezes sem esbarrar no UNIQUE(installment_id, stage, channel).
    const stage = `manual_${Date.now()}`;

    try {
      console.log('[INFO][API:/api/financeiro/charge] Enviando cobrança manual', { installmentId, channel: ch });
      await sendText(target, message, { delayTyping: 2 });
      await logCharge(tenantId, inst.id, inst.client_id, stage, ch, true, null);
    } catch (err) {
      await logCharge(tenantId, inst.id, inst.client_id, stage, ch, false, err.message);
      console.error('[ERRO][API:/api/financeiro/charge] Falha no envio', { installmentId, error: err.message });
      return res.status(502).json({ success: false, error: `Falha ao enviar a cobrança: ${err.message}` });
    }

    // Sino (broadcast) — best-effort, não bloqueia o sucesso.
    try {
      await createNotification(
        tenantId, 'finance_charge_sent', 'Cobrança enviada',
        `Cobrança da parcela enviada para ${inst.company_name} (${ch === 'group' ? 'grupo' : 'pessoal'}).`,
        inst.client_id, { channel: ch, installmentId }
      );
    } catch (e) {
      console.error('[WARN][API:/api/financeiro/charge] Falha ao criar notificação', { error: e.message });
    }

    console.log('[SUCESSO][API:/api/financeiro/charge] Cobrança enviada', { installmentId, channel: ch });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:/api/financeiro/charge]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
