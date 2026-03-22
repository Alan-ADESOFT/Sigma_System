/**
 * infra/api/zapi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Integração com a Z-API (WhatsApp).
 * Ponto único de contato com a API — nunca chamar diretamente em outros módulos.
 *
 * Documentação Z-API: https://developer.z-api.io
 * Endpoint base: https://api.z-api.io/instances/{INSTANCE}/token/{TOKEN}
 *
 * Variáveis necessárias no .env:
 *   ZAPI_INSTANCE     — ID da instância
 *   ZAPI_TOKEN        — Token da instância
 *   ZAPI_CLIENT_TOKEN — Token de segurança da conta (header Client-Token)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;

/**
 * Valida que as variáveis de ambiente estão configuradas.
 * Chamado internamente antes de cada envio.
 */
function assertConfig() {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
    throw new Error(
      '[ZApi] Variáveis de ambiente incompletas. Configure ZAPI_INSTANCE, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN no .env'
    );
  }
}

/**
 * Mascara o telefone para log — mostra apenas os 4 últimos dígitos.
 */
function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return '****' + phone.slice(-4);
}

/**
 * Envia uma mensagem de texto simples via Z-API.
 *
 * @param {string} phone — telefone no formato internacional sem formatação (ex: "5592999999999")
 * @param {string} message — texto da mensagem (suporta *negrito*, _itálico_, \n)
 * @param {object} [options] — { delayMessage?: number, delayTyping?: number }
 * @returns {Promise<{zaapId: string, messageId: string, id: string}>}
 */
async function sendText(phone, message, options = {}) {
  assertConfig();

  // Limpa qualquer caractere não numérico do telefone
  const cleanPhone = phone.replace(/\D/g, '');

  console.log('[INFO][ZApi] Enviando mensagem', {
    phone: maskPhone(cleanPhone),
    messageLength: message.length,
    hasDelay: !!options.delayMessage || !!options.delayTyping,
  });

  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

  const body = {
    phone: cleanPhone,
    message,
    ...options,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error('[ERRO][ZApi] Falha no envio', {
      phone: maskPhone(cleanPhone),
      status: response.status,
      body: errBody,
    });
    throw new Error(`Z-API retornou status ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  console.log('[SUCESSO][ZApi] Mensagem enviada', {
    phone: maskPhone(cleanPhone),
    zaapId: data.zaapId,
    messageId: data.messageId,
  });

  return data;
}

module.exports = { sendText };
