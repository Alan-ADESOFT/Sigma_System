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
 * Mensagem WhatsApp PRÓPRIA por etapa (do documento de onboarding).
 * Chave = stage_number (1..12). O cron usa onboarding_stages_config.whatsapp_message
 * (seedado a partir daqui) com fallback pro template genérico (buildStageLinkMessage).
 * `{LINK}` é substituído pelo link da etapa; `{NOME}`, `{ETAPA}`, `{TITULO}` opcionais.
 */
export const STAGE_WHATSAPP_MESSAGES = {
  1: `Primeira etapa liberada.

Assiste o vídeo e responde logo abaixo. Coisas básicas pra eu entender a base do seu negócio.
Sem essa camada, nenhuma estratégia se sustenta.

4 minutos. Vamo.

{LINK}`,
  2: `Etapa 2 no ar.

Hoje a gente vai destrinchar o que você vende.
E você vai descobrir uma coisa: o que mais vende nem sempre é o que mais te paga.

Responde com calma. Aqui mora oportunidade que você não tá vendo.

{LINK}`,
  3: `Etapa 3. A mais importante até agora.

A maioria dos empresários conhece o próprio produto. Pouquíssimos conhecem o próprio cliente.
Hoje eu te ajudo a sair desse pouquíssimo.

Responde com calma. Dá nome, idade, profissão, sentimento. Trata como pessoa real.

{LINK}`,
  4: `Etapa 4. Hoje a gente olha pra fora.

Cuidado: não é sobre copiar concorrente.
É sobre enxergar o que ele faz pra construir o que ele não faz.

Me passa os arrobas. Eu analiso depois.

{LINK}`,
  5: `Etapa 5 no ar.

Hoje você vira pra dentro.
E vai descobrir coisas que você já faz e nunca contou pra ninguém.

Responde como se tivesse explicando pra um amigo. Sem ensaiar.

{LINK}`,
  6: `Dia 7. Hoje a gente faz inventário.

Você tem mais prova social do que imagina.
A maioria dos empresários tem munição parada na gaveta.

Lista tudo. Mesmo o que parece pequeno. Eu organizo depois.

{LINK}`,
  7: `Etapa 8. A mais importante do processo inteiro.

Aqui você não responde formulário. Você me entrega a alma da sua marca.
Sem essa camada, todo o resto vira técnica vazia.

Senta com calma. Responde como se estivesse contando pra alguém que vai cuidar da história. Porque vou.

{LINK}`,
  8: `Etapa 9 liberada.

Hoje você não vai me impressionar.
Você vai me mostrar onde tá hoje, na crueza.
É assim que estratégia honesta nasce.

Sem maquiar. 5 minutos.

{LINK}`,
  9: `Etapa 10. A mais desconfortável.

E a mais importante pra eu te entregar resultado.
Não tem vergonha em "não sei". Tem vergonha em fingir que sabe.

Responde com verdade. Eu cuido do resto.

{LINK}`,
  10: `Etapa 11 e 12.

Hoje a gente expõe os pontos de vazamento.

Vazamento de cliente. Vazamento de venda. Vazamento de dinheiro.
A maioria não enxerga porque ninguém parou pra perguntar.

Eu paro. Responde.

{LINK}`,
  11: `Etapa 13 e 14.

Você passou treze dias olhando pra trás e pra dentro.

Hoje você olha pra frente.
E define o tamanho do que a gente vai construir.

Sonha alto aqui. Eu trabalho pra sustentar.

{LINK}`,
  12: `Última etapa.

15 dias atrás você começou esse processo achando que era formulário.
Hoje você termina enxergando o seu próprio negócio em camadas que muita gente nunca vai enxergar.

Responde as últimas três. E descansa.
O jogo agora muda de lado.

{LINK}`,
};

/**
 * Caption do vídeo de boas-vindas (VÍDEO 0 do documento). Default pro setting
 * onboarding_welcome_video_description quando o admin ainda não configurou.
 */
export const WELCOME_CAPTION = `Dá play.

Empresário sério não muda o jogo respondendo formulário genérico.
Por isso esse é diferente.

Cada pergunta aqui foi desenhada pra eu enxergar a sua empresa em 360. Não a versão maquiada que vai pro relatório. A versão real, por dentro.
Marketing, comercial, sistema, processo, posicionamento. Tudo que move a sua operação de verdade.

Porque conteúdo sem intencionalidade não gera resultado.
Tráfego sem intencionalidade não gera resultado.
E o meu trabalho não é entregar mais do mesmo. É construir movimento.

Quando você terminar, eu vou conhecer a sua empresa em camadas que muita gente que trabalha contigo há anos ainda não enxergou.
Aí sim começa o jogo.

Inicie agora.
Do meu lado, 100% a todo momento.`;

/**
 * Mensagem de descanso (dias 4, 8, 13) — texto do documento de onboarding.
 * Já vem pronta no banco; este é o fallback caso não haja override.
 */
export const REST_MESSAGES = {
  4:  `Tá indo muito bem.
Suas respostas já mostram muita coisa.

Amanhã a gente entra no campo de batalha: concorrentes.
Descansa hoje.`,

  8:  `Metade do caminho.
Você já tá na frente de 99% dos empresários que tentam estratégia.

Segunda metade: dados, números, vendas, e a parte mais bonita — a história da sua marca.

Amanhã a gente entra na sua história. Prepara o coração.`,

  13: `Último respiro.
Você já olhou pra dentro do seu negócio com lupa.
Pouca gente tem coragem de fazer isso.

Amanhã e depois: objetivos e fechamento.
Vamo terminar com força.`,
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
