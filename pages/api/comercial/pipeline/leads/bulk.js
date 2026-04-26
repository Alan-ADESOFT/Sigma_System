/**
 * pages/api/comercial/pipeline/leads/bulk.js
 *   POST → bulk action: 'move' | 'assign' | 'delete' | 'send_whatsapp'
 *
 * Body: { action, leadIds, payload }
 * Limite: 50 leadIds por chamada.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const { query } = require('../../../../../infra/db');
const { sendText } = require('../../../../../infra/api/zapi');
const { checkRateLimit, logRateLimitEvent } = require('../../../../../infra/rateLimit');
const pipeline = require('../../../../../models/comercial/pipeline.model');
const tpl = require('../../../../../models/comercial/messageTemplate.model');
const activity = require('../../../../../models/comercial/activity.model');

const MAX_BULK = 50;

function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
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
  console.log('[INFO][API:bulk]', { action: req.body?.action });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { action, leadIds, payload } = req.body || {};

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, error: 'leadIds (array) obrigatório' });
    }
    if (leadIds.length > MAX_BULK) {
      return res.status(413).json({ success: false, error: `Máximo ${MAX_BULK} leads por chamada` });
    }

    let processed = 0;
    let failed = 0;
    const results = [];

    if (action === 'move') {
      if (!payload?.columnId) return res.status(400).json({ success: false, error: 'payload.columnId obrigatório' });
      for (const id of leadIds) {
        try {
          await pipeline.moveLead(id, tenantId, { columnId: payload.columnId }, userId);
          processed++; results.push({ id, ok: true });
        } catch (err) {
          failed++; results.push({ id, ok: false, error: err.message });
        }
      }
      return res.json({ success: true, processed, failed, results });
    }

    if (action === 'assign') {
      const assignedTo = payload?.assignedTo || null;
      for (const id of leadIds) {
        try {
          await pipeline.updateLead(id, tenantId, { assigned_to: assignedTo });
          processed++; results.push({ id, ok: true });
        } catch (err) {
          failed++; results.push({ id, ok: false, error: err.message });
        }
      }
      return res.json({ success: true, processed, failed, results });
    }

    if (action === 'delete') {
      for (const id of leadIds) {
        try {
          await pipeline.deleteLead(id, tenantId);
          processed++; results.push({ id, ok: true });
        } catch (err) {
          failed++; results.push({ id, ok: false, error: err.message });
        }
      }
      return res.json({ success: true, processed, failed, results });
    }

    if (action === 'send_whatsapp') {
      const maxBulk = Number(process.env.COMERCIAL_RATE_LIMIT_BULK_WHATSAPP) || 50;
      if (leadIds.length > maxBulk) {
        return res.status(413).json({ success: false, error: `Bulk WhatsApp limitado a ${maxBulk} leads` });
      }

      // Rate limit total
      const dailyMax = Number(process.env.COMERCIAL_RATE_LIMIT_WHATSAPP_PER_DAY) || 100;
      const rl = await checkRateLimit(tenantId, 'comercial_whatsapp', dailyMax, 24 * 60);
      if (!rl.ok || rl.remaining < leadIds.length) {
        return res.status(429).json({
          success: false,
          error: `Limite diário (${dailyMax}/dia, restam ${rl.remaining}) — reduza a seleção.`,
          retryAfter: rl.resetIn,
        });
      }

      const delayMs = Number(process.env.COMERCIAL_BULK_WHATSAPP_DELAY_MS) || 3000;

      // Renderiza message uma única vez se templateId — depois substitui vars por lead
      let template = null;
      if (payload?.templateId) {
        template = await tpl.getTemplateById(payload.templateId, tenantId);
        if (!template) return res.status(404).json({ success: false, error: 'Template não encontrado' });
      } else if (!payload?.message || !String(payload.message).trim()) {
        return res.status(400).json({ success: false, error: 'message ou templateId obrigatório' });
      }

      const me = userId
        ? (await query(`SELECT name FROM tenants WHERE id = $1`, [userId]))[0]
        : null;

      for (let i = 0; i < leadIds.length; i++) {
        const id = leadIds[i];
        try {
          const lead = await pipeline.getLeadById(id, tenantId);
          if (!lead) throw new Error('Lead não encontrado');
          const phoneClean = normalizePhone(lead.phone);
          if (!phoneClean) throw new Error('Lead sem telefone');

          let finalMessage = payload?.message || '';
          if (template) {
            const vars = {
              nome_empresa:     lead.company_name || '',
              nome_contato:     lead.contact_name || lead.company_name || '',
              cidade:           lead.city  || '',
              nicho:            lead.niche || '',
              nome_responsavel: me?.name?.split(' ')?.[0] || me?.name || '',
            };
            finalMessage = tpl.renderTemplate(template.content, vars);
          }

          const zapiResult = await sendText(phoneClean, finalMessage, { delayTyping: 3 });

          await activity.createActivity(tenantId, {
            pipelineLeadId: id,
            type: 'whatsapp_sent',
            content: finalMessage,
            metadata: {
              messageId: zapiResult?.messageId || zapiResult?.zaapId || null,
              phoneMasked: maskPhone(phoneClean),
              templateId: template?.id || null,
              bulk: true,
              contentSnippet: finalMessage.slice(0, 120),
            },
            createdBy: userId,
          });
          await logRateLimitEvent(tenantId, 'comercial_whatsapp', { leadId: id, bulk: true });

          processed++; results.push({ id, ok: true, messageId: zapiResult?.messageId });
        } catch (err) {
          failed++; results.push({ id, ok: false, error: err.message });
        }

        // Delay anti-ban entre cada envio (não no último)
        if (i < leadIds.length - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
      return res.json({ success: true, processed, failed, results });
    }

    return res.status(400).json({ success: false, error: 'action inválida' });
  } catch (err) {
    console.error('[ERRO][API:bulk]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
