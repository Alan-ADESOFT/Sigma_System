/**
 * @fileoverview Sanitização de prompts do usuário antes de enviar à IA
 * @description Removes caracteres de controle e detecta padrões suspeitos
 * de prompt injection. Não BLOQUEIA — apenas registra audit. A decisão final
 * de bloquear é do provider (safety filter).
 */

const SUSPICIOUS_PATTERNS = [
  /ignore\s+(previous|all|above)/i,
  /system\s*[:=]/i,
  /<\s*\/?\s*script[^>]*>/i,
  /\b(jailbreak|DAN|developer\s*mode)\b/i,
  /you\s+are\s+now/i,
  /\bdisregard\s+(your|all)\b/i,
];

const MAX_LENGTH = 4000;

/**
 * Limpa whitespace, remove control chars (mantém \n e \t), trunca em MAX_LENGTH.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  if (typeof text !== 'string') return '';
  // Remove control chars (0x00-0x1F) exceto \t (0x09) e \n (0x0A)
  let cleaned = text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  // Collapse whitespace mas preserva quebras de linha
  cleaned = cleaned.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
  cleaned = cleaned.trim();
  if (cleaned.length > MAX_LENGTH) cleaned = cleaned.slice(0, MAX_LENGTH);
  return cleaned;
}

/**
 * Detecta padrões suspeitos. Retorna o primeiro pattern detectado ou null.
 */
function detectSuspicious(text) {
  if (!text) return null;
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(text)) return re.source;
  }
  return null;
}

/**
 * Sanitiza e analisa o prompt.
 *
 * @param {string} text
 * @returns {{ cleaned: string, suspicious: string|null, originalLength: number, truncated: boolean }}
 */
function sanitizePrompt(text) {
  const originalLength = (text || '').length;
  const cleaned = cleanText(text);
  return {
    cleaned,
    suspicious: detectSuspicious(cleaned),
    originalLength,
    truncated: originalLength > MAX_LENGTH,
  };
}

module.exports = { sanitizePrompt, cleanText, detectSuspicious, MAX_LENGTH };
