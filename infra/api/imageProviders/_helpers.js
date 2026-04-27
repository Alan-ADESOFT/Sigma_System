/**
 * @fileoverview Helpers compartilhados pelos providers de imagem
 * @description Carregamento de uploads internos, normalização de erros,
 * resolução de URLs públicas pra providers que precisam (fal.ai).
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Carrega arquivo de /uploads/ como Buffer. Defesa contra path traversal.
 * @param {string} internalUrl - "/uploads/..."
 * @returns {Promise<Buffer|null>}
 */
async function loadInternalUpload(internalUrl) {
  if (!internalUrl || typeof internalUrl !== 'string') return null;
  if (!internalUrl.startsWith('/uploads/')) return null;
  if (internalUrl.includes('..')) return null;
  try {
    const fullPath = path.join(process.cwd(), 'public', internalUrl);
    return await fs.readFile(fullPath);
  } catch (err) {
    console.warn('[WARN][ImageProviders] não consegui ler upload', {
      url: internalUrl, error: err.message,
    });
    return null;
  }
}

/**
 * Detecta MIME type pelos bytes mágicos. Útil pro Gemini (precisa do MIME
 * correto no inlineData).
 */
function detectMime(buffer) {
  if (!buffer || buffer.length < 12) return 'image/jpeg';
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  // WebP: RIFF .... WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  // GIF: GIF87a / GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Resolve URL pública a partir de uma URL interna /uploads/...
 * Usado por providers que NÃO aceitam base64 direto (ex: fal.ai/flux-pro/kontext
 * exige image_url HTTP/HTTPS publicamente acessível).
 *
 * Estratégia:
 *   1. Se NEXT_PUBLIC_BASE_URL é HTTPS público (não localhost), prefixa.
 *   2. Senão, tenta upload pro storage do fal via /storage/upload.
 *   3. Se nada disso for possível, retorna null (provider deve fallback).
 *
 * @param {string} internalUrl
 * @param {object} [opts]
 * @param {string} [opts.falApiKey] - pra upload temporário no storage
 * @returns {Promise<string|null>}
 */
async function ensurePublicUrl(internalUrl, opts = {}) {
  if (!internalUrl) return null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (baseUrl && baseUrl.startsWith('https://') && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    return `${baseUrl.replace(/\/$/, '')}${internalUrl}`;
  }

  // Fallback: upload temporário pro storage do fal
  if (opts.falApiKey) {
    const buffer = await loadInternalUpload(internalUrl);
    if (!buffer) return null;
    return uploadToFalStorage(buffer, opts.falApiKey, internalUrl);
  }

  console.warn('[WARN][ImageProviders] sem URL pública pra', {
    internalUrl,
    hint: 'configure NEXT_PUBLIC_BASE_URL com URL HTTPS pública ou passe falApiKey',
  });
  return null;
}

/**
 * Upload temporário pro storage do fal.ai. Retorna URL pública.
 * Endpoint: POST https://rest.alpha.fal.ai/storage/upload (signed URL).
 *
 * Implementação simples: usa o endpoint público do fal storage.
 * A URL retornada é válida pra ser usada como image_url em chamadas pro fal.
 */
async function uploadToFalStorage(buffer, apiKey, originalPath = 'ref.jpg') {
  try {
    // Step 1: pede signed URL
    const ext = (originalPath.match(/\.([a-z0-9]+)$/i) || [, 'jpg'])[1].toLowerCase();
    const filename = `sigma_${Date.now()}.${ext}`;
    const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_name: filename,
        content_type: detectMime(buffer),
      }),
    });
    if (!initRes.ok) {
      console.warn('[WARN][ImageProviders] fal storage initiate falhou', { status: initRes.status });
      return null;
    }
    const { upload_url, file_url } = await initRes.json();
    if (!upload_url || !file_url) return null;

    // Step 2: PUT bytes pro upload_url
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': detectMime(buffer) },
      body: buffer,
    });
    if (!putRes.ok) {
      console.warn('[WARN][ImageProviders] fal storage PUT falhou', { status: putRes.status });
      return null;
    }
    return file_url;
  } catch (err) {
    console.warn('[WARN][ImageProviders] fal storage upload exceção', { error: err.message });
    return null;
  }
}

/**
 * Constrói erro padronizado com Error.code.
 */
function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Mapeia status HTTP → code padronizado de provider.
 * Usado quando o provider não distinguir CONTENT_BLOCKED/RATE_LIMITED no body.
 */
function mapHttpStatus(status, body = '') {
  const text = String(body || '');
  if (status === 401 || status === 403) return 'AUTHENTICATION_FAILED';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 402 || /quota|insufficient|billing/i.test(text)) return 'INSUFFICIENT_QUOTA';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status === 400 && /safety|policy|block|nsfw|content/i.test(text)) return 'CONTENT_BLOCKED';
  return 'PROVIDER_ERROR';
}

module.exports = {
  loadInternalUpload,
  detectMime,
  ensurePublicUrl,
  uploadToFalStorage,
  err,
  mapHttpStatus,
};
