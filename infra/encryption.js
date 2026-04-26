/**
 * @fileoverview Criptografia simétrica (AES-256-GCM) para segredos do banco
 * @description Usado para armazenar API keys de provedores de imagem (Vertex,
 * OpenAI, Fal, Gemini) e credenciais JSON do Vertex em image_settings.
 *
 * Por que AES-256-GCM:
 *   · GCM oferece confidencialidade + autenticação (auth tag de 16 bytes).
 *     Sem auth tag, qualquer corrupção do ciphertext passa despercebida.
 *   · 256 bits de chave + IV de 12 bytes (recomendação NIST para GCM).
 *   · NUNCA reutilizamos IV — geramos um novo a cada encrypt().
 *
 * Formato de saída (string única em base64): "iv:authTag:ciphertext"
 * Cada parte é base64-encoded individualmente, separada por ":".
 *
 * Chave mestra:
 *   1. process.env.IMAGE_ENCRYPTION_KEY (base64 de 32 bytes) — preferido
 *   2. Fallback: scrypt(INTERNAL_API_TOKEN) — emite warning, dev-only
 */

const crypto = require('crypto');

// ── Constantes ──────────────────────────────────────────────────────────────
const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;   // 256 bits
const IV_BYTES = 12;    // recomendado para GCM (96 bits)
const TAG_BYTES = 16;   // padrão GCM (128 bits)

// ── Resolução de chave (cached no boot) ─────────────────────────────────────
let _cachedKey = null;
let _warnedFallback = false;

/**
 * Retorna a chave mestra de 32 bytes.
 * Prioridade: IMAGE_ENCRYPTION_KEY (base64) > scrypt(INTERNAL_API_TOKEN).
 *
 * @returns {Buffer} chave de 32 bytes
 */
function getMasterKey() {
  if (_cachedKey) return _cachedKey;

  const envKey = process.env.IMAGE_ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'base64');
    if (buf.length !== KEY_BYTES) {
      throw new Error(
        `IMAGE_ENCRYPTION_KEY inválida: esperado ${KEY_BYTES} bytes em base64, recebido ${buf.length}. ` +
        `Gere uma chave nova com: openssl rand -base64 32`
      );
    }
    _cachedKey = buf;
    return _cachedKey;
  }

  // Fallback: deriva da INTERNAL_API_TOKEN via scrypt (NÃO usar em produção)
  const fallbackSeed = process.env.INTERNAL_API_TOKEN || process.env.SESSION_SECRET;
  if (!fallbackSeed) {
    throw new Error(
      'IMAGE_ENCRYPTION_KEY não configurada e nenhum fallback disponível ' +
      '(INTERNAL_API_TOKEN/SESSION_SECRET). Configure IMAGE_ENCRYPTION_KEY no .env.'
    );
  }
  if (!_warnedFallback) {
    console.warn(
      '[WARN][Encryption] IMAGE_ENCRYPTION_KEY não definida — derivando chave de ' +
      'INTERNAL_API_TOKEN via scrypt. Em produção, configure IMAGE_ENCRYPTION_KEY.'
    );
    _warnedFallback = true;
  }
  // Salt fixo é OK aqui — a entropia está no INTERNAL_API_TOKEN.
  // Chamadas concorrentes precisam derivar a MESMA chave.
  _cachedKey = crypto.scryptSync(fallbackSeed, 'sigma-image-enc-v1', KEY_BYTES);
  return _cachedKey;
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Criptografa uma string em texto puro.
 * @param {string} plaintext - Texto a criptografar
 * @returns {string} formato "iv:authTag:ciphertext" (cada parte em base64)
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('encrypt: plaintext precisa ser string');
  }
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Descriptografa uma string previamente criptografada por encrypt().
 * Lança erro se o auth tag não bater (dado corrompido ou chave errada).
 *
 * @param {string} encrypted - String no formato "iv:authTag:ciphertext"
 * @returns {string} texto puro
 */
function decrypt(encrypted) {
  if (typeof encrypted !== 'string' || !encrypted.includes(':')) {
    throw new Error('decrypt: formato inválido — esperado "iv:authTag:ciphertext"');
  }
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('decrypt: formato inválido — número de partes incorreto');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  if (iv.length !== IV_BYTES) throw new Error('decrypt: IV com tamanho inválido');
  if (authTag.length !== TAG_BYTES) throw new Error('decrypt: auth tag com tamanho inválido');

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch (err) {
    // Falha de auth tag = dado corrompido OU chave trocada
    throw new Error(`decrypt: falha de autenticação (${err.message})`);
  }
}

/**
 * Mascara uma chave para exibição segura na UI.
 * Padrão: 3 primeiros + "..." + 6 últimos chars.
 * Strings curtas (≤ 9) viram tudo "*".
 *
 * @param {string} plaintext
 * @returns {string} ex: "sk-...abc123"
 */
function mask(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  if (plaintext.length <= 9) return '*'.repeat(plaintext.length);
  const head = plaintext.slice(0, 3);
  const tail = plaintext.slice(-6);
  return `${head}...${tail}`;
}

/**
 * Heurística: a string parece um payload encrypt() válido?
 * Não confirma que descriptografa — só valida o formato externo.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    if (iv.length !== IV_BYTES) return false;
    if (tag.length !== TAG_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, mask, isEncrypted };
