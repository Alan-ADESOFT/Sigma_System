/**
 * lib/auth.js — Utilitários de autenticação
 * Hash de senha com scrypt (Node.js built-in, sem dependências externas)
 * Token de sessão assinado com HMAC-SHA256
 */

const crypto = require('crypto');

/* ── Segredo da sessão (definir SESSION_SECRET no .env em produção) ── */
const SESSION_SECRET = process.env.SESSION_SECRET || 'sigma-internal-secret-2024';

/* ─────────────────────────────────────────────
   Senha
───────────────────────────────────────────── */

/**
 * Gera hash seguro da senha usando scrypt.
 * Retorna no formato: "salt:hash"
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Compara senha em texto com hash armazenado.
 * Usa timingSafeEqual para evitar timing attacks.
 */
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const colonIdx = stored.indexOf(':');
  const salt = stored.substring(0, colonIdx);
  const hash = stored.substring(colonIdx + 1);
  try {
    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(check, 'hex')
    );
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────
   Token de Sessão
───────────────────────────────────────────── */

/**
 * Gera token de sessão assinado: base64(userId:timestamp:hmac)
 */
function generateToken(userId) {
  const payload = `${userId}:${Date.now()}`;
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

/**
 * Verifica e decodifica token de sessão.
 * Retorna { userId } se válido, ou null se inválido.
 */
function verifyToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const payload = decoded.substring(0, lastColon);
    const sig = decoded.substring(lastColon + 1);
    const expected = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('hex');
    if (expected.length !== sig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    const firstColon = payload.indexOf(':');
    const userId = payload.substring(0, firstColon);
    return { userId };
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken };
