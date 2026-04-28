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
 * Normaliza um telefone para o formato exigido pelo Z-API (E.164 sem `+`),
 * detectando automaticamente DDI BR (`55`) ou US (`1`).
 *
 * Regras (em ordem):
 *   1. Strip de caracteres não numéricos.
 *   2. Já normalizado BR (`55` + 10/11 dígitos)         → mantém.
 *   3. Já normalizado US (`1` + 10 dígitos NANP)        → mantém.
 *   4. >13 dígitos                                       → mantém (group ID, etc).
 *   5. 11 dígitos com `9` na 3ª posição                 → BR mobile, prefixa `55`.
 *   6. 10 dígitos com DDD 11-99 e 1º dígito após DDD em [2-5] → BR fixo, `55`.
 *   7. 10 dígitos com 1º dígito em [2-9] (NANP areacode) → US, prefixa `1`.
 *   8. Fallback                                          → assume BR, prefixa `55`.
 *
 * Limitação conhecida: 10 dígitos sem DDI é ambíguo entre BR fixo (ex.: DDD 41
 * + 12345678) e US (areacode 415 + 5551234). Como o produto é BR, BR ganha.
 * Para números US com 10 dígitos, digite com `1` na frente (`14155551234`).
 */
function normalizeZApiPhone(phone) {
  if (phone == null) throw new Error('[ZApi] Telefone vazio');
  const n = String(phone).replace(/\D/g, '');
  if (!n) throw new Error('[ZApi] Telefone sem dígitos');

  // (2) BR já com DDI: 55 + DDD(2) + 8 ou 9 dígitos = 12 ou 13 chars
  if ((n.length === 12 || n.length === 13) && n.startsWith('55')) return n;

  // (3) US já com DDI: 1 + areacode(2-9) + 7 = 11 chars, 2º dígito 2-9
  if (n.length === 11 && n[0] === '1' && n[1] >= '2' && n[1] <= '9') return n;

  // (4) Provavelmente group ID ou número não-padrão — não tocar
  if (n.length > 13 || n.length < 10) return n;

  // (5) BR mobile sem DDI: 11 dígitos com 9 na posição 2 (após DDD)
  if (n.length === 11 && n[2] === '9') return '55' + n;

  if (n.length === 10) {
    const ddd = parseInt(n.slice(0, 2), 10);
    const after = n[2];
    // (6) BR fixo: DDD válido + 1º dígito após DDD entre 2-5
    if (ddd >= 11 && ddd <= 99 && after >= '2' && after <= '5') return '55' + n;
    // (7) US sem DDI: areacode NANP (2-9), 4º dígito também 2-9
    if (n[0] >= '2' && n[0] <= '9' && n[3] >= '2' && n[3] <= '9') return '1' + n;
  }

  // (8) Default: assume BR
  return '55' + n;
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

  const cleanPhone = normalizeZApiPhone(phone);

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

module.exports = { sendText, normalizeZApiPhone };
