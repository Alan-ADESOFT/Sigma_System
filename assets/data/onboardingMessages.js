/**
 * assets/data/onboardingMessages.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Templates de mensagens WhatsApp do sistema de onboarding.
 *
 * São usadas pelo cron diário (pages/api/cron/onboarding-daily.js) para enviar
 * via Z-API:
 *   · stageLink   — manhã do dia da etapa, manda o link
 *   · restMessage — manhã dos dias de descanso (4, 8, 13)
 *   · reminder    — final do dia se a etapa não foi respondida
 *   · completion  — quando o cliente termina as 12 etapas
 *
 * IMPORTANTE: Z-API suporta *negrito* e _itálico_ (formato WhatsApp markdown).
 * Mantemos o tom seco e direto — sem exclamações exageradas, sem emojis demais.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Mensagem da manhã: libera a etapa do dia.
 * Substituições: {NOME}, {ETAPA}, {TITULO}, {LINK}.
 */
export function buildStageLinkMessage({ name, stageNumber, stageTitle, link }) {
  const firstName = (name || 'Bom dia').split(' ')[0];
  return (
`Bom dia, *${firstName}*.

Etapa *${stageNumber}* liberada: _${stageTitle}_
Hoje o dia é teu. Pega 5-7 minutos, assiste o vídeo e responde sem pressa.

${link}

Quanto mais real, mais a estratégia vira teu jeito — não um molde genérico.`
  );
}

/**
 * Mensagem de descanso (dias 4, 8, 13).
 * Já vem pronta no banco; este é o fallback caso não haja override.
 */
export const REST_MESSAGES = {
  4:  `Tá indo muito bem. Suas respostas já mostram muita coisa.
Amanhã: campo de batalha — *concorrentes*.
Hoje, descansa. Sem etapa, sem link, sem cobrança.`,

  8:  `*Metade*. Você tá na frente de 99% dos empresários que abriram a empresa e nunca pararam pra pensar nela.
Segunda metade: dados, números, vendas.
Amanhã: história da sua marca. A etapa mais bonita do briefing. Prepara o coração.`,

  13: `Último respiro antes do fechamento.
Você já olhou seu negócio com lupa por 12 dias.
Amanhã e depois: objetivos e fechamento. Vamos terminar com força.`,
};

/**
 * Lembrete enviado no final do dia se a etapa não foi respondida.
 * Manda apenas se passar das 19h e o cliente não tiver tocado no link.
 */
export function buildReminderMessage({ name, stageNumber, link }) {
  const firstName = (name || 'Oi').split(' ')[0];
  return (
`Oi, *${firstName}*.

A etapa *${stageNumber}* de hoje ainda tá te esperando.
Sem pressão — só pra lembrar que o link tá aqui:

${link}

Se hoje não rolar, amanhã libera a próxima do mesmo jeito.`
  );
}

/**
 * Mensagem de conclusão — quando todas as 12 etapas foram respondidas.
 */
export function buildCompletionMessage({ name }) {
  const firstName = (name || 'Parabéns').split(' ')[0];
  return (
`*${firstName}*, terminamos.

15 dias. 12 etapas. 157 perguntas.
Você fez algo que 99% dos empresários nunca fizeram: parar e olhar o próprio negócio do começo ao fim.

Agora é com a Sigma. Em até 7 dias o time devolve:
- Posicionamento estratégico
- Avatar e mapa de objeções
- Plano de conteúdo do primeiro mês
- Próximos passos comerciais

Obrigado pela honestidade nas respostas. Foi ela que fez esse trabalho valer.`
  );
}
