/**
 * pages/api/comercial/pipeline/leads/[id]/whatsapp.js
 *   POST → envia WhatsApp via Z-API + registra activity.
 *
 * Body: { phone?, message?, templateId? }
 * Se templateId passado e message vazia, renderiza template no servidor.
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { sendText } = require('../../../../../../infra/api/zapi');
const { checkRateLimit, logRateLimitEvent } = require('../../../../../../infra/rateLimit');
const pipeline = require('../../../../../../models/comercial/pipeline.model');
const tpl = require('../../../../../../models/comercial/messageTemplate.model');
const activity = require('../../../../../../models/comercial/activity.model');
const { queryOne } = require('../../../../../../infra/db');

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Adiciona 55 se vier sem código do país e tiver tamanho típico BR (10 ou 11)
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return '****' + phone.slice(-4);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/whatsapp]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    let { phone, message, templateId } = req.body || {};

    // 1. Resolve telefone
    const phoneClean = normalizePhone(phone || lead.phone);
    if (!phoneClean) {
      return res.status(400).json({ success: false, error: 'Lead não tem telefone — informe phone no body' });
    }

    // 2. Se templateId, renderiza
    let resolvedTemplateName = null;
    if (templateId && (!message || !String(message).trim())) {
      const template = await tpl.getTemplateById(templateId, tenantId);
      if (!template) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      resolvedTemplateName = template.name;

      const me = userId ? await queryOne(`SELECT name FROM tenants WHERE id = $1`, [userId]) : null;
      const vars = {
        nome_empresa:     lead.company_name || '',
        nome_contato:     lead.contact_name || lead.company_name || '',
        cidade:           lead.city  || '',
        nicho:            lead.niche || '',
        nome_responsavel: me?.name?.split(' ')?.[0] || me?.name || '',
      };
      message = tpl.renderTemplate(template.content, vars);
    }

    // 3. Validações
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, error: 'message obrigatória' });
    }
    if (message.length > 4096) {
      return res.status(400).json({ success: false, error: 'Mensagem muito longa (máx 4096)' });
    }

    // 4. Rate limit
    const maxPerDay = Number(process.env.COMERCIAL_RATE_LIMIT_WHATSAPP_PER_DAY) || 100;
    const rl = await checkRateLimit(tenantId, 'comercial_whatsapp', maxPerDay, 24 * 60);
    if (!rl.ok) {
      return res.status(429).json({
        success: false,
        error: `Limite diário (${maxPerDay} msgs/dia) atingido. Tente em ${Math.ceil(rl.resetIn / 60)} min.`,
        retryAfter: rl.resetIn,
      });
    }

    // 5. Envia
    let zapiResult;
    try {
      zapiResult = await sendText(phoneClean, message, { delayTyping: 3 });
    } catch (err) {
      console.error('[ERRO][API:whatsapp] Z-API falhou', { error: err.message });
      return res.status(502).json({
        success: false,
        error: 'Falha ao enviar via Z-API. Verifique se a instância está conectada.',
        details: err.message,
      });
    }

    // 6. Registra activity
    await activity.createActivity(tenantId, {
      pipelineLeadId: id,
      type: 'whatsapp_sent',
      content: message,
      metadata: {
        messageId: zapiResult?.messageId || zapiResult?.zaapId || null,
        phoneMasked: maskPhone(phoneClean),
        templateId: templateId || null,
        templateName: resolvedTemplateName,
        contentSnippet: message.slice(0, 120),
      },
      createdBy: userId,
    });

    await logRateLimitEvent(tenantId, 'comercial_whatsapp', { leadId: id });

    console.log('[SUCESSO][API:whatsapp]', { leadId: id, phone: maskPhone(phoneClean) });
    return res.json({
      success: true,
      messageId: zapiResult?.messageId || zapiResult?.zaapId || null,
    });
  } catch (err) {
    console.error('[ERRO][API:whatsapp]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
