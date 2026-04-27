/**
 * @fileoverview Shim ultra-fino para POST /api/image/generate
 *
 * O handler real está em `lib/handlers/imageGenerate.js`. Este arquivo é
 * intencionalmente minúsculo (sem imports além do dynamic import) pra
 * evitar o bug do Next dev em que `.next/server/pages/api/image/generate.js`
 * era purgado quando o worker em paralelo invalidava arquivos compartilhados.
 *
 * Como agora não tem dependências top-level que o worker importa, não é
 * invalidado pelo HMR. Mesmo se for, recompila instantaneamente.
 *
 * Sprint v1.1 — abril 2026.
 */

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};

export default async function handler(req, res) {
  // Lazy import via require — só carrega na 1ª chamada, e o cache de require
  // não é purgado pelo Next file watcher (porque está fora de /pages).
  const { imageGenerateHandler } = require('../../../lib/handlers/imageGenerate');
  return imageGenerateHandler(req, res);
}
