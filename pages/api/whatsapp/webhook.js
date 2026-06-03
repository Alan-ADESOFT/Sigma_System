/**
 * pages/api/whatsapp/webhook.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Webhook INBOUND da Z-API (on-message-received). É chamado pela Z-API a cada
 * mensagem recebida — configure a URL deste endpoint no painel da Z-API
 * ("Ao receber"). Em dev local exige um túnel público (a Z-API precisa alcançar
 * a URL).
 *
 * Função: processar o comando `/reuniao` (também aceita `/reunião`) e criar uma
 * reunião no sistema, com segurança via allowlist (grupos + números) configurada
 * em Config. Tarefas.
 *
 * IMPORTANTE: o formato exato do payload inbound da Z-API não é conhecido no
 * repo (a integração era só outbound). O parser abaixo é TOLERANTE e tenta
 * vários campos comuns. Ajuste `extractInbound` depois de ver 1 payload real.
 *
 * SEMPRE responde 200 — rejeições lógicas (não autorizado, sem comando) também
 * retornam 200 pra a Z-API não ficar reenviando.
 *
 * @route POST /api/whatsapp/webhook  (sem auth — chamado server-to-server)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { queryOne } from '../../../infra/db';
const { sendText } = require('../../../infra/api/zapi');
const { getReuniaoConfig } = require('../../../models/reuniaoBotConfig.model');
const meetingModel = require('../../../models/meeting.model');
const { runCompletion } = require('../../../models/ia/completion');
const { extractJSON } = require('../../../models/tasks/bulkImportAI');

// Dedupe por messageId (backstop a retries da Z-API). Ancorado em globalThis
// pra sobreviver ao HMR do dev. Single-instance — suficiente como backstop.
const _seen = globalThis.__reuniaoSeen || (globalThis.__reuniaoSeen = new Set());

function stripAccentsLower(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function todayBRT() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
}

function maskPhone(p) {
  const s = String(p || '');
  return s.length < 4 ? '****' : '****' + s.slice(-4);
}

/** Extrai os campos relevantes de um payload inbound da Z-API (tolerante). */
function extractInbound(body) {
  const text =
    body?.text?.message ??
    (typeof body?.text === 'string' ? body.text : null) ??
    body?.message ??
    body?.body ??
    '';
  const chatId = String(body?.phone || body?.chatId || body?.groupId || '');
  const isGroup =
    body?.isGroup === true ||
    chatId.includes('@g.us') ||
    chatId.includes('-group') ||
    !!body?.groupId;
  const senderPhone = String(body?.participantPhone || body?.author || body?.senderPhone || (isGroup ? '' : chatId) || '');
  const messageId = String(body?.messageId || body?.id || body?.zaapId || '');
  const fromMe = body?.fromMe === true;
  return { text: String(text || '').trim(), chatId, isGroup, senderPhone, messageId, fromMe };
}

function digitsOf(p) {
  return String(p || '').replace(/\D/g, '');
}

/** Parser por IA — extrai título/data/hora/envolvidos de texto livre. */
async function parseReuniao(args, tenantId) {
  const today = todayBRT();
  const system = `Você extrai os dados de UMA reunião a partir de um comando de WhatsApp. Hoje é ${today} (fuso America/Sao_Paulo).
Responda APENAS com JSON válido (sem markdown), nesta estrutura:
{"title":"assunto curto","description":"string ou null","meeting_date":"YYYY-MM-DD","start_time":"HH:MM ou null","participants":["Nome 1","Nome 2"]}
Regras:
- Interprete datas relativas (amanhã, sexta, próxima terça, "2 de julho") em relação a hoje (${today}). Se não houver data, use ${today}.
- start_time em 24h (HH:MM) ou null.
- participants são os nomes citados (texto livre). Se não houver, [].
- title é obrigatório e curto.`;
  try {
    const completion = await runCompletion('weak', system, args, 600, {
      tenantId,
      operationType: 'reuniao_command',
    });
    const j = extractJSON(completion.text);
    if (!j || !j.title) return null;
    return {
      title: String(j.title).trim(),
      description: j.description ? String(j.description).trim() : null,
      meeting_date: (j.meeting_date && /^\d{4}-\d{2}-\d{2}$/.test(j.meeting_date)) ? j.meeting_date : null,
      start_time: (j.start_time && /^\d{2}:\d{2}/.test(j.start_time)) ? j.start_time.slice(0, 5) : null,
      participants: Array.isArray(j.participants)
        ? j.participants.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim())
        : [],
    };
  } catch (e) {
    console.error('[ERRO][webhook] parseReuniao falhou', { error: e.message });
    return null;
  }
}

async function safeSend(to, msg) {
  if (!to) return;
  try {
    await sendText(to, msg, { delayTyping: 1 });
  } catch (e) {
    console.error('[ERRO][webhook] resposta falhou', { error: e.message });
  }
}

export default async function handler(req, res) {
  // Sempre 200 — evita reenvios da Z-API em rejeições lógicas.
  if (req.method !== 'POST') return res.status(200).json({ ok: true, ignored: 'method' });

  try {
    const inb = extractInbound(req.body || {});
    if (inb.fromMe || !inb.text) return res.status(200).json({ ok: true });

    // Dedupe por messageId.
    if (inb.messageId) {
      if (_seen.has(inb.messageId)) return res.status(200).json({ ok: true, dedup: true });
      _seen.add(inb.messageId);
      if (_seen.size > 5000) _seen.clear();
    }

    // É o comando /reuniao?
    const norm = stripAccentsLower(inb.text);
    if (!norm.startsWith('/reuniao')) return res.status(200).json({ ok: true });

    const tenantId = process.env.WORKSPACE_TENANT_ID;
    if (!tenantId) {
      console.error('[ERRO][webhook] WORKSPACE_TENANT_ID ausente');
      return res.status(200).json({ ok: true });
    }

    const cfg = await getReuniaoConfig(tenantId);
    if (!cfg.enabled) return res.status(200).json({ ok: true, disabled: true });

    // Allowlist: grupo permitido OU número permitido.
    const senderDigits = digitsOf(inb.senderPhone).slice(-11);
    const allowedNumberDigits = (cfg.allowedNumbers || []).map((n) => digitsOf(n).slice(-11));
    const groupOk = inb.isGroup && (cfg.allowedGroups || []).includes(inb.chatId);
    const numberOk = !!senderDigits && allowedNumberDigits.includes(senderDigits);
    if (!groupOk && !numberOk) {
      console.warn('[WARN][webhook] remetente não autorizado', {
        chatId: inb.chatId, sender: maskPhone(inb.senderPhone), isGroup: inb.isGroup,
      });
      return res.status(200).json({ ok: true, unauthorized: true });
    }

    // Parse dos argumentos via IA.
    const args = inb.text.replace(/^\s*\/reuni[aã]o\s*/i, '').trim();
    if (!args) {
      await safeSend(inb.chatId, 'Uso: /reuniao [assunto] [data] [hora] com [pessoas]. Ex: /reuniao alinhamento de tráfego amanhã 14h com João e Maria');
      return res.status(200).json({ ok: true, emptyArgs: true });
    }

    const parsed = await parseReuniao(args, tenantId);
    if (!parsed || !parsed.title) {
      await safeSend(inb.chatId, 'Não consegui entender a reunião. Tente: /reuniao [assunto] [data] [hora] com [pessoas].');
      return res.status(200).json({ ok: true, parseFailed: true });
    }

    // created_by: primeiro admin/god ativo (sem assumir coluna phone em tenants).
    const admin = await queryOne(
      `SELECT id FROM tenants
        WHERE is_active = true AND (role = 'god' OR role = 'admin')
        ORDER BY created_at ASC LIMIT 1`
    );
    const creatorId = admin?.id;
    if (!creatorId) {
      console.error('[ERRO][webhook] nenhum admin/god ativo para created_by');
      await safeSend(inb.chatId, 'Não foi possível criar a reunião (sem usuário responsável configurado).');
      return res.status(200).json({ ok: true });
    }

    const meeting_date = parsed.meeting_date || todayBRT();
    const meeting = await meetingModel.createMeeting({
      title: parsed.title,
      description: parsed.description || null,
      meeting_date,
      start_time: parsed.start_time || '09:00',
      end_time: null,
      client_id: null,
      participants: parsed.participants,
      status: 'scheduled',
      meet_link: null,
      obs: 'Criada via comando /reuniao no WhatsApp',
      created_by: creatorId,
    }, tenantId);

    // Sino (broadcast) — best-effort.
    try {
      const { createNotification } = require('../../../models/clientForm');
      await createNotification(
        tenantId, 'meeting_created', 'Reunião criada via WhatsApp',
        `${parsed.title} — ${meeting_date}`, null, { source: 'reuniao_command', meetingId: meeting.id }
      );
    } catch (e) {
      console.error('[WARN][webhook] notificação falhou', { error: e.message });
    }

    const dataLabel = meeting_date.split('-').reverse().join('/');
    const horaLabel = parsed.start_time ? ` ${parsed.start_time}` : '';
    const partLabel = parsed.participants.length ? `\nEnvolvidos: ${parsed.participants.join(', ')}` : '';
    await safeSend(inb.chatId, `Reunião criada:\n*${parsed.title}*\nData: ${dataLabel}${horaLabel}${partLabel}`);

    console.log('[SUCESSO][webhook] reunião criada via /reuniao', { meetingId: meeting.id, date: meeting_date });
    return res.status(200).json({ ok: true, meetingId: meeting.id });
  } catch (err) {
    console.error('[ERRO][API:/api/whatsapp/webhook]', { error: err.message, stack: err.stack });
    return res.status(200).json({ ok: true, error: err.message });
  }
}
