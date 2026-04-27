/**
 * components/comercial/inputMasks.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Helpers de máscara e validação reutilizáveis nos formulários comerciais.
 * Sem dep externa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Phone (BR) ──────────────────────────────────────────────────────────────

/**
 * Aplica máscara de telefone BR enquanto o usuário digita.
 * 10 dígitos (fixo): (XX) XXXX-XXXX
 * 11 dígitos (cel):  (XX) XXXXX-XXXX
 * 12+ com código do país: +55 (XX) XXXXX-XXXX
 */
export function maskPhoneBR(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '').slice(0, 13);

  if (d.length <= 2)  return d;
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  // 12-13 dígitos: assume código do país
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

/**
 * Retorna apenas os dígitos do telefone (pra envio à API).
 */
export function unmaskPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Valida telefone BR (apenas pelo nº de dígitos).
 * Retorna string de erro ou null se OK.
 */
export function validatePhoneBR(raw, { required = false } = {}) {
  const d = unmaskPhone(raw);
  if (!d) return required ? 'Telefone obrigatório' : null;
  if (d.length < 10) return 'Telefone incompleto (mín 10 dígitos)';
  if (d.length > 13) return 'Telefone muito longo';
  return null;
}

// ─── Email ───────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw, { required = false } = {}) {
  const v = String(raw || '').trim();
  if (!v) return required ? 'E-mail obrigatório' : null;
  if (!EMAIL_RE.test(v)) return 'E-mail inválido';
  return null;
}

// ─── URL ─────────────────────────────────────────────────────────────────────

/**
 * Normaliza URL — adiciona https:// se faltar protocolo.
 */
export function normalizeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return 'https://' + v;
}

export function validateUrl(raw, { required = false } = {}) {
  const v = String(raw || '').trim();
  if (!v) return required ? 'URL obrigatória' : null;
  try {
    new URL(normalizeUrl(v));
    return null;
  } catch {
    return 'URL inválida';
  }
}

// ─── Currency BRL ────────────────────────────────────────────────────────────

/**
 * Máscara de moeda BRL — entrada digitada vira "R$ X.XXX,XX".
 * Trabalha sobre dígitos brutos (centavos).
 */
export function maskCurrencyBRL(raw) {
  if (raw == null || raw === '') return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/**
 * Converte valor mascarado em número (em reais).
 */
export function unmaskCurrency(raw) {
  if (raw == null || raw === '') return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
}

// ─── Instagram handle ───────────────────────────────────────────────────────

/**
 * Normaliza handle do Instagram — extrai só o nome do usuário.
 *  "@usuario" → "@usuario"
 *  "instagram.com/usuario" → "@usuario"
 *  "usuario" → "@usuario"
 */
export function normalizeInstagram(raw) {
  if (!raw) return '';
  const v = String(raw).trim();
  if (!v) return '';
  const m = v.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (m) return '@' + m[1].replace(/\/+$/, '');
  if (v.startsWith('@')) return v;
  return '@' + v.replace(/^@+/, '');
}

// ─── UF (estado BR) ──────────────────────────────────────────────────────────

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function validateUF(raw, { required = false } = {}) {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return required ? 'UF obrigatória' : null;
  if (!UFS.includes(v)) return 'UF inválida';
  return null;
}

export { UFS };
