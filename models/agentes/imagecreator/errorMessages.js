/**
 * @fileoverview Mapeamento de error codes técnicos → mensagens amigáveis (pt-BR)
 * @description Usado tanto pelo worker (notificação no sininho) quanto pelo
 * frontend (overlay de erro). Mantenha o tom calmo, sem jargão técnico, e
 * indique ao usuário o próximo passo concreto.
 *
 * Codes vêm de infra/api/imageProviders/* (CONTENT_BLOCKED, RATE_LIMITED,
 * TIMEOUT, INVALID_INPUT, PROVIDER_ERROR, ...) ou do próprio worker
 * (TIMEOUT, MODEL_UNAVAILABLE, BRANDBOOK_FETCH_FAILED, ...).
 *
 * indisponível, autenticação falha, refs inválidas.
 */

const FRIENDLY_BY_CODE = {
  CONTENT_BLOCKED:
    'O conteúdo solicitado foi bloqueado pelo filtro de segurança do provedor. Tente reformular sua descrição evitando termos sensíveis (violência, conteúdo adulto, pessoas reais por nome).',
  RATE_LIMITED:
    'O provedor de imagem atingiu o limite temporário de uso. Aguarde 2-3 minutos e tente novamente, ou troque de modelo.',
  TIMEOUT:
    'A geração demorou mais do que o esperado e foi cancelada (limite de 90 segundos). Isso geralmente indica sobrecarga no provedor. Tente novamente ou escolha outro modelo.',
  INVALID_INPUT:
    'Algo nas configurações está incorreto. Verifique se a chave de API do provedor está válida em Configurações → Imagem.',
  PROVIDER_ERROR:
    'O provedor de imagem retornou um erro inesperado. Tente novamente ou escolha outro modelo no seletor.',
  PROVIDER_UNAVAILABLE:
    'O provedor está temporariamente indisponível. Tente outro modelo ou aguarde alguns minutos.',
  TEMPLATE_LIMIT:
    'Você atingiu o limite de 20 templates por cliente. Apague templates antigos para liberar espaço.',
  REFERENCE_TOO_LARGE:
    'Uma das imagens de referência é muito grande. Reduza para menos de 10 MB cada.',
  REFERENCE_INVALID:
    'Não foi possível processar uma das imagens de referência. Use JPG, PNG ou WebP válidos.',
  IMAGE_INPUT_NOT_SUPPORTED:
    'O modelo escolhido não aceita imagens como entrada com este modo. Mude o modo da referência ou escolha outro modelo (Nano Banana 2 ou Flux Kontext suportam).',
  AUTHENTICATION_FAILED:
    'A chave de API do provedor não está funcionando. Acesse Configurações → Imagem e atualize a chave.',
  INSUFFICIENT_QUOTA:
    'Sua conta no provedor não tem créditos suficientes. Verifique seu painel no provedor escolhido.',
  MODEL_UNAVAILABLE:
    'Este modelo não está mais disponível ou não foi habilitado no seu projeto. Escolha outro modelo.',
  SMART_SELECTOR_FAILED:
    'O modo inteligente não conseguiu decidir o melhor modelo. Tentamos com o modelo padrão.',
  BRANDBOOK_FETCH_FAILED:
    'Não foi possível carregar o brandbook do cliente. A geração continuou sem ele.',
};

/**
 * Resolve uma mensagem amigável a partir do código + texto técnico.
 * Se receber um código desconhecido, devolve mensagem genérica útil.
 *
 * @param {string} code   - error.code (CONTENT_BLOCKED, etc)
 * @param {string} [rawMessage] - error.message original (truncado se usado)
 * @returns {string}
 */
function friendlyMessage(code, rawMessage = '') {
  // Caso especial: OpenAI exige verificação de organização para modelos GPT Image.
  // Mensagem da API contém "must be verified" — link de verificação no console.
  if (code === 'AUTHENTICATION_FAILED' && /must be verified/i.test(String(rawMessage))) {
    return 'Sua organização OpenAI precisa ser verificada para usar GPT Image. Acesse platform.openai.com/settings/organization/general → Verify Organization. A liberação leva até 15 minutos para propagar.';
  }
  if (FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code];
  // Fallback útil pra INVALID_INPUT cru sem mapeamento
  if (code === 'INVALID_INPUT' && rawMessage) {
    return `Configuração inválida: ${String(rawMessage).slice(0, 200)}`;
  }
  return 'Não foi possível gerar a imagem. Tente novamente em alguns minutos.';
}

module.exports = { friendlyMessage, FRIENDLY_BY_CODE };
