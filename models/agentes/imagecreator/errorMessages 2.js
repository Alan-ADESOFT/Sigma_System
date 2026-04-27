/**
 * @fileoverview Mapeamento de error codes técnicos → mensagens amigáveis (pt-BR)
 * @description Usado tanto pelo worker (notificação no sininho) quanto pelo
 * frontend (overlay de erro). Mantenha o tom calmo, sem jargão técnico, e
 * indique ao usuário o próximo passo concreto.
 *
 * Codes vêm de infra/api/imageProviders/* (CONTENT_BLOCKED, RATE_LIMITED,
 * TIMEOUT, INVALID_INPUT, PROVIDER_ERROR) ou do próprio worker.
 */

const FRIENDLY_BY_CODE = {
  CONTENT_BLOCKED:
    'Conteúdo bloqueado pelo filtro de segurança do provedor — tente reformular o prompt sem termos sensíveis.',
  RATE_LIMITED:
    'O provedor de imagem atingiu o limite de requisições. Tente novamente em alguns minutos.',
  TIMEOUT:
    'Falha de conexão com o provedor (timeout). Tente novamente em alguns minutos.',
  INVALID_INPUT:
    'Configuração inválida — verifique os parâmetros e a chave de API do provedor.',
  PROVIDER_ERROR:
    'O provedor retornou um erro inesperado. Tente novamente; se persistir, troque o modelo.',
  TEMPLATE_LIMIT:
    'Limite de templates por cliente atingido. Apague templates antigos para liberar espaço.',
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
  if (FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code];
  // Para INVALID_INPUT cru sem mapeamento, dá pra ser mais útil:
  if (code === 'INVALID_INPUT' && rawMessage) {
    return `Configuração inválida: ${String(rawMessage).slice(0, 200)}`;
  }
  return 'Não foi possível gerar a imagem. Tente novamente em alguns minutos.';
}

module.exports = { friendlyMessage, FRIENDLY_BY_CODE };
