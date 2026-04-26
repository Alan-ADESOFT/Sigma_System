/**
 * infra/contentPlanMedia.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Constantes e helpers de validacao de midia do Planejamento de Conteudo.
 * Compartilhados entre o endpoint de upload (server) e o CreativeCard (client),
 * para que a UI valide antes do upload e o backend valide de novo (defesa em
 * profundidade).
 *
 * Regras Instagram aplicadas:
 *   · Reel  → vertical 9:16 (~0.5625) — somente video
 *   · Story → vertical 9:16 (~0.5625) — imagem ou video
 *   · Post  → 4:5 (0.8) ate 1.91:1 — imagem ou video
 *   · Carousel → 4:5 a 1.91:1 (todos os itens devem ter o mesmo aspecto)
 *
 * Tolerancia: ±2-5% para cobrir variacoes de codificacao de camera/edicao.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');

/* ─────────────────────────────────────────────
   Caminho base do storage
───────────────────────────────────────────── */
function getStorageRoot() {
  if (process.env.STORAGE_PATH) return process.env.STORAGE_PATH;
  // Fallback seguro: dentro do projeto (gitignore recomendado).
  // Funciona em dev local e em qualquer prod que nao tenha volume mapeado.
  return path.join(process.cwd(), 'storage');
}

/* ─────────────────────────────────────────────
   Whitelists de MIME
───────────────────────────────────────────── */
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
]);

const ALLOWED_MIMES = new Set([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]);

const MIME_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'video/mp4':  'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;   // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;  // 100 MB

function kindOf(mime) {
  if (ALLOWED_IMAGE_MIMES.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIMES.has(mime)) return 'video';
  return null;
}

/* ─────────────────────────────────────────────
   Regras por tipo de criativo
───────────────────────────────────────────── */
// aspect = width / height
const ASPECT_RULES = {
  // Reel: 9:16 = 0.5625, somente video
  reel: {
    minAspect: 0.50,
    maxAspect: 0.60,
    allowedKinds: ['video'],
    label: 'Reel',
    hint: 'Vídeo vertical 9:16 (1080×1920).',
    targetLabel: '9:16 vertical',
  },
  // Story: 9:16, imagem ou video
  story: {
    minAspect: 0.50,
    maxAspect: 0.60,
    allowedKinds: ['image', 'video'],
    label: 'Story',
    hint: 'Imagem ou vídeo vertical 9:16 (1080×1920).',
    targetLabel: '9:16 vertical',
  },
  // Post: 4:5 (0.8) ate 1.91:1 (1.91)
  post: {
    minAspect: 0.78,
    maxAspect: 1.95,
    allowedKinds: ['image', 'video'],
    label: 'Post',
    hint: '1:1 (1080×1080), 4:5 (1080×1350) ou 1.91:1 (1080×566).',
    targetLabel: '1:1, 4:5 ou 1.91:1',
  },
  // Carousel: mesmas faixas do post; recomenda-se 1:1 ou 4:5
  carousel: {
    minAspect: 0.78,
    maxAspect: 1.95,
    allowedKinds: ['image', 'video'],
    label: 'Carrossel',
    hint: 'Todos os itens devem ter o mesmo aspecto. Recomendado 1:1 ou 4:5.',
    targetLabel: '1:1 ou 4:5 (mesmo p/ todos)',
  },
};

function getRule(creativeType) {
  return ASPECT_RULES[creativeType] || null;
}

/* ─────────────────────────────────────────────
   Magic byte sniff — confirma o conteudo real
───────────────────────────────────────────── */
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38 (37|39) 61
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // MP4 / MOV: ....ftyp
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    if (buf[8] === 0x71 && buf[9] === 0x74) return 'video/quicktime';
    return 'video/mp4';
  }
  // WebM (Matroska): 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

/* ─────────────────────────────────────────────
   Validacao de aspecto
───────────────────────────────────────────── */
function aspectInRange(width, height, rule) {
  if (!width || !height || !rule) return true; // sem dimensoes ou sem regra → passa
  const ratio = Number(width) / Number(height);
  return ratio >= rule.minAspect && ratio <= rule.maxAspect;
}

function describeAspect(width, height) {
  if (!width || !height) return null;
  const r = (Number(width) / Number(height)).toFixed(3);
  return `${width}×${height} (aspecto ${r})`;
}

module.exports = {
  getStorageRoot,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_MIMES,
  MIME_EXTENSION,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ASPECT_RULES,
  getRule,
  kindOf,
  sniffMime,
  aspectInRange,
  describeAspect,
};
