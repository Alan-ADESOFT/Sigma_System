/**
 * Validador compartilhado pra URLs de upload interno (/uploads/...).
 * Usado por todos os endpoints que aceitam image inputs do user.
 *
 * Rejeita: protocolo absoluto, path traversal (..), null byte, slash duplo,
 * não-string. Exige prefixo /uploads/.
 */

function isInternalUploadUrl(url) {
  if (typeof url !== 'string') return false;
  if (!url.startsWith('/uploads/')) return false;
  if (url.includes('..') || url.includes('//') || url.includes('\0')) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

module.exports = { isInternalUploadUrl };
