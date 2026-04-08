/**
 * models/financeBotConfig.model.js
 * Configuração do bot de cobrança financeira via settings (key/value).
 */

const { getSetting, setSetting } = require('./settings.model');

const KEYS = {
  active:          'finance_bot_active',
  numbers:         'finance_bot_numbers',
  dispatchTime:    'finance_bot_dispatch_time',
  activeDays:      'finance_bot_active_days',
  chargeGroup:     'finance_bot_charge_group',
  chargePersonal:  'finance_bot_charge_personal',
  msgOneDayBefore: 'finance_bot_msg_1day_before',
  msgDueToday:     'finance_bot_msg_due_today',
  msgOverdueOne:   'finance_bot_msg_overdue_1',
  msgOverdueN:     'finance_bot_msg_overdue_n',
  msgSummary:      'finance_bot_msg_summary',
};

function getDefaultMessages() {
  return {
    msgOneDayBefore: 'Olá, *{nome}*! 👋\nPassando para lembrar que a parcela *{numero}* do seu contrato vence *amanhã*, dia *{data}*.\n💰 Valor: *R$ {valor}*\nQualquer dúvida, estamos à disposição! 😊',
    msgDueToday: 'Olá, *{nome}*! 📅\nA parcela *{numero}* do seu contrato vence *hoje*, dia *{data}*.\n💰 Valor: *R$ {valor}*\nAguardamos a confirmação do pagamento. Obrigado! 🙏',
    msgOverdueOne: 'Olá, *{nome}*.\nIdentificamos que a parcela *{numero}* venceu *ontem*, dia *{data}*, e ainda não foi registrada como paga.\n💰 Valor: *R$ {valor}*\nPor favor, entre em contato para regularizar. 📞',
    msgOverdueN: 'Olá, *{nome}*.\nA parcela *{numero}* do seu contrato está em atraso desde *{data}* ({dias_atraso} dias).\n💰 Valor: *R$ {valor}*\nPedimos que regularize o quanto antes. Estamos à disposição para conversar. 🤝',
    msgSummary: '📊 *Resumo de Inadimplentes — {data_hoje}*\n\nClientes com parcelas em atraso:\n{lista_clientes}\n\nTotal em aberto: *R$ {total}*',
  };
}

async function getBotConfig(tenantId) {
  const defaults = getDefaultMessages();

  const [
    active, numbers, dispatchTime, activeDays,
    chargeGroup, chargePersonal,
    msgOneDayBefore, msgDueToday, msgOverdueOne, msgOverdueN, msgSummary,
  ] = await Promise.all([
    getSetting(tenantId, KEYS.active),
    getSetting(tenantId, KEYS.numbers),
    getSetting(tenantId, KEYS.dispatchTime),
    getSetting(tenantId, KEYS.activeDays),
    getSetting(tenantId, KEYS.chargeGroup),
    getSetting(tenantId, KEYS.chargePersonal),
    getSetting(tenantId, KEYS.msgOneDayBefore),
    getSetting(tenantId, KEYS.msgDueToday),
    getSetting(tenantId, KEYS.msgOverdueOne),
    getSetting(tenantId, KEYS.msgOverdueN),
    getSetting(tenantId, KEYS.msgSummary),
  ]);

  return {
    active:          active === 'true',
    numbers:         numbers ? JSON.parse(numbers) : [],
    dispatchTime:    dispatchTime || '08:00',
    activeDays:      activeDays ? JSON.parse(activeDays) : [1, 2, 3, 4, 5],
    chargeGroup:     chargeGroup === 'true',
    chargePersonal:  chargePersonal !== 'false', // default true
    msgOneDayBefore: msgOneDayBefore || defaults.msgOneDayBefore,
    msgDueToday:     msgDueToday     || defaults.msgDueToday,
    msgOverdueOne:   msgOverdueOne   || defaults.msgOverdueOne,
    msgOverdueN:     msgOverdueN     || defaults.msgOverdueN,
    msgSummary:      msgSummary      || defaults.msgSummary,
  };
}

async function saveBotConfig(tenantId, config) {
  const ops = [];

  if (config.active !== undefined)          ops.push(setSetting(tenantId, KEYS.active,          String(config.active)));
  if (config.numbers !== undefined)         ops.push(setSetting(tenantId, KEYS.numbers,         JSON.stringify(config.numbers)));
  if (config.dispatchTime !== undefined)    ops.push(setSetting(tenantId, KEYS.dispatchTime,    config.dispatchTime));
  if (config.activeDays !== undefined)      ops.push(setSetting(tenantId, KEYS.activeDays,      JSON.stringify(config.activeDays)));
  if (config.chargeGroup !== undefined)     ops.push(setSetting(tenantId, KEYS.chargeGroup,     String(config.chargeGroup)));
  if (config.chargePersonal !== undefined)  ops.push(setSetting(tenantId, KEYS.chargePersonal,  String(config.chargePersonal)));
  if (config.msgOneDayBefore !== undefined) ops.push(setSetting(tenantId, KEYS.msgOneDayBefore, config.msgOneDayBefore));
  if (config.msgDueToday !== undefined)     ops.push(setSetting(tenantId, KEYS.msgDueToday,     config.msgDueToday));
  if (config.msgOverdueOne !== undefined)   ops.push(setSetting(tenantId, KEYS.msgOverdueOne,   config.msgOverdueOne));
  if (config.msgOverdueN !== undefined)     ops.push(setSetting(tenantId, KEYS.msgOverdueN,     config.msgOverdueN));
  if (config.msgSummary !== undefined)      ops.push(setSetting(tenantId, KEYS.msgSummary,      config.msgSummary));

  await Promise.all(ops);
}

module.exports = { getBotConfig, saveBotConfig, getDefaultMessages };
