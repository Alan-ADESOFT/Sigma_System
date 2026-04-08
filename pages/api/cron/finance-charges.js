/**
 * pages/api/cron/finance-charges.js
 * Cron de cobrança financeira via WhatsApp (Z-API).
 *
 * Dispara mensagens de lembrete/cobrança para parcelas:
 *   - 1 dia antes do vencimento
 *   - No dia do vencimento
 *   - 1 dia após vencimento
 *   - Atraso prolongado (> 1 dia)
 *   - Resumo diário de inadimplentes para admin
 *
 * Protegido por x-internal-token.
 * Recomendado: "0 11 * * *" (8h BRT)
 */

import { query } from '../../../infra/db';
const { sendText } = require('../../../infra/api/zapi');
const { getBotConfig } = require('../../../models/financeBotConfig.model');
const { logCharge, alreadySent } = require('../../../models/financeChargeLog.model');

function todayBRT() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
}

function tomorrowBRT() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
}

function isoWeekdayBRT() {
  const dateStr = todayBRT();
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay() === 0 ? 7 : d.getDay(); // ISO: Mon=1, Sun=7
}

function fmtDateBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function fmtBRL(val) {
  return parseFloat(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysDiff(dateStr, today) {
  const a = new Date(dateStr + 'T00:00:00');
  const b = new Date(today + 'T00:00:00');
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function replacePlaceholders(template, vars) {
  let msg = template;
  for (const [key, val] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return msg;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const token = req.headers['x-internal-token'];
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  try {
    console.log('[INFO][Cron:FinanceCharges] Iniciando cron de cobrança financeira...');

    const today = todayBRT();
    const tomorrow = tomorrowBRT();
    const weekday = isoWeekdayBRT();

    // Buscar todos os tenants ativos
    const tenants = await query(`SELECT id FROM tenants WHERE is_active = true`);
    let totalSent = 0;

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // 1. Ler config do bot
      const bot = await getBotConfig(tenantId);
      if (!bot.active) {
        console.log('[INFO][Cron:FinanceCharges] Bot inativo para tenant', { tenantId });
        continue;
      }

      // 2. Verificar dia ativo
      if (!bot.activeDays.includes(weekday)) {
        console.log('[INFO][Cron:FinanceCharges] Dia não ativo', { tenantId, weekday, activeDays: bot.activeDays });
        continue;
      }

      // 3. Buscar parcelas relevantes com dados do cliente
      const installments = await query(
        `SELECT ci.*, cc.id AS contract_id,
                mc.company_name, mc.phone, mc.whatsapp_group_id
         FROM client_installments ci
         JOIN client_contracts cc ON cc.id = ci.contract_id
         JOIN marketing_clients mc ON mc.id = ci.client_id
         WHERE mc.tenant_id = $1
           AND ci.status != 'paid'
           AND ci.due_date <= ($2::date + INTERVAL '1 day')
         ORDER BY ci.due_date ASC`,
        [tenantId, today]
      );

      const overdueList = [];

      for (const inst of installments) {
        const dueStr = inst.due_date.toISOString ? inst.due_date.toISOString().split('T')[0] : String(inst.due_date).split('T')[0];
        const diff = daysDiff(dueStr, today);

        let stage, msgTemplate;
        if (diff === -1) {
          // due_date = amanhã → 1 dia antes
          stage = '1day_before';
          msgTemplate = bot.msgOneDayBefore;
        } else if (diff === 0) {
          stage = 'due_today';
          msgTemplate = bot.msgDueToday;
        } else if (diff === 1) {
          stage = 'overdue_1';
          msgTemplate = bot.msgOverdueOne;
        } else if (diff > 1) {
          stage = 'overdue_n';
          msgTemplate = bot.msgOverdueN;
        } else {
          continue; // due_date mais de 1 dia no futuro — não deveria chegar aqui pelo SQL
        }

        // Coletar inadimplentes para resumo
        if (diff >= 1) {
          overdueList.push({
            name: inst.company_name,
            number: inst.installment_number,
            totalInstallments: null, // Será preenchido se possível
            value: parseFloat(inst.value),
            daysOverdue: diff,
          });
        }

        const vars = {
          nome: inst.company_name,
          numero: String(inst.installment_number),
          data: fmtDateBR(dueStr),
          valor: fmtBRL(inst.value),
          dias_atraso: String(diff),
        };
        const message = replacePlaceholders(msgTemplate, vars);

        // 4c. Cobrar no número pessoal
        if (bot.chargePersonal && inst.phone) {
          const already = await alreadySent(inst.id, stage, 'personal');
          if (!already) {
            try {
              await sendText(inst.phone, message, { delayTyping: 3 });
              await logCharge(tenantId, inst.id, inst.client_id, stage, 'personal', true, null);
              totalSent++;
              console.log('[SUCESSO][Cron:FinanceCharges] Mensagem enviada (pessoal)', { clientId: inst.client_id, stage });
            } catch (err) {
              await logCharge(tenantId, inst.id, inst.client_id, stage, 'personal', false, err.message);
              console.error('[ERRO][Cron:FinanceCharges] Falha envio pessoal', { clientId: inst.client_id, stage, error: err.message });
            }
          }
        }

        // 4d. Cobrar no grupo WhatsApp
        if (bot.chargeGroup && inst.whatsapp_group_id) {
          const already = await alreadySent(inst.id, stage, 'group');
          if (!already) {
            try {
              await sendText(inst.whatsapp_group_id, message, { delayTyping: 3 });
              await logCharge(tenantId, inst.id, inst.client_id, stage, 'group', true, null);
              totalSent++;
              console.log('[SUCESSO][Cron:FinanceCharges] Mensagem enviada (grupo)', { clientId: inst.client_id, stage });
            } catch (err) {
              await logCharge(tenantId, inst.id, inst.client_id, stage, 'group', false, err.message);
              console.error('[ERRO][Cron:FinanceCharges] Falha envio grupo', { clientId: inst.client_id, stage, error: err.message });
            }
          }
        }
      }

      // 5. Resumo de inadimplentes para admin
      if (overdueList.length > 0 && bot.numbers.length > 0) {
        // Agrupar por cliente
        const clientMap = {};
        for (const item of overdueList) {
          if (!clientMap[item.name]) clientMap[item.name] = { parcelas: [], total: 0, maxDays: 0 };
          clientMap[item.name].parcelas.push(item);
          clientMap[item.name].total += item.value;
          clientMap[item.name].maxDays = Math.max(clientMap[item.name].maxDays, item.daysOverdue);
        }

        const listaClientes = Object.entries(clientMap).map(([name, data]) => {
          if (data.parcelas.length === 1) {
            const p = data.parcelas[0];
            return `• *${name}* — Parcela ${p.number} — R$ ${fmtBRL(p.value)} — ${p.daysOverdue} dia${p.daysOverdue > 1 ? 's' : ''} atraso`;
          }
          const nums = data.parcelas.map(p => p.number).join(' e ');
          return `• *${name}* — Parcelas ${nums} em atraso — R$ ${fmtBRL(data.total)} total`;
        }).join('\n');

        const totalAberto = overdueList.reduce((s, i) => s + i.value, 0);
        const summaryMsg = replacePlaceholders(bot.msgSummary, {
          data_hoje: fmtDateBR(today),
          lista_clientes: listaClientes,
          total: fmtBRL(totalAberto),
        });

        for (const number of bot.numbers) {
          try {
            await sendText(number, summaryMsg, { delayTyping: 3 });
            totalSent++;
            console.log('[SUCESSO][Cron:FinanceCharges] Resumo enviado', { number: number.slice(-4) });
          } catch (err) {
            console.error('[ERRO][Cron:FinanceCharges] Falha envio resumo', { number: number.slice(-4), error: err.message });
          }
        }
      }
    }

    console.log('[SUCESSO][Cron:FinanceCharges] Concluído', { totalSent });
    return res.json({ success: true, messages_sent: totalSent });

  } catch (err) {
    console.error('[ERRO][Cron:FinanceCharges] Erro geral', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
