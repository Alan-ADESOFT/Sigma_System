/**
 * pages/api/content-planning/upload-media.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST {
 *   planId, fileName, mimeType, base64,
 *   creativeType?,                  // 'post' | 'reel' | 'carousel' | 'story'
 *   dimensions?: { width, height }, // só usado p/ video (cliente envia)
 * }
 *
 * Storage: {STORAGE_PATH || cwd/storage}/content-planning/{tenantId}/{planId}/{filename}
 * URL servida: /api/content-planning/media/{tenantId}/{planId}/{filename}
 *
 * Defesas (em ordem):
 *   1. whitelist de MIME (image/jpeg|png|webp|gif, video/mp4|mov|webm)
 *   2. plano pertence ao tenant resolvido
 *   3. base64 valido + tamanho dentro do limite (10MB img / 100MB vid)
 *   4. magic-byte sniff confirma o tipo declarado (anti-spoof)
 *   5. dimensoes:
 *        - imagem → lidas no servidor via sharp
 *        - video  → vem do client (defesa em profundidade; se ausente, skip aspecto)
 *   6. compatibilidade com creativeType:
 *        - reel → so video
 *        - aspecto dentro da faixa permitida pelo tipo
 *   7. nome do arquivo regenerado (Date.now()_random.ext) — nunca usa o nome do cliente
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');
const { queryOne } = require('../../../infra/db');
const {
  getStorageRoot,
  ALLOWED_MIMES,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  MIME_EXTENSION,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  getRule,
  kindOf,
  sniffMime,
  aspectInRange,
  describeAspect,
} = require('../../../infra/contentPlanMedia');

export const config = {
  api: { bodyParser: { sizeLimit: '110mb' } },
};

function fail(res, status, error, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Metodo nao permitido');

  const tenantId = await resolveTenantId(req);
  const { planId, fileName, mimeType, base64, creativeType, dimensions } = req.body || {};

  if (!planId || !fileName || !mimeType || !base64) {
    return fail(res, 400, 'planId, fileName, mimeType e base64 obrigatorios');
  }
  if (!ALLOWED_MIMES.has(mimeType)) {
    return fail(res, 400, `mimeType nao permitido (${mimeType})`);
  }

  // Plano precisa pertencer ao tenant
  const plan = await queryOne(
    'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
    [planId, tenantId]
  );
  if (!plan) return fail(res, 404, 'Planejamento nao encontrado');

  try {
    // 1. Decodifica base64
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    let buffer;
    try {
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch {
      return fail(res, 400, 'base64 invalido');
    }
    if (!buffer || buffer.length === 0) {
      return fail(res, 400, 'arquivo vazio');
    }

    // 2. Tamanho por kind
    const declaredKind = kindOf(mimeType);
    const maxBytes = declaredKind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (buffer.length > maxBytes) {
      const limit = declaredKind === 'video' ? '100MB' : '10MB';
      return fail(res, 413, `Arquivo excede o limite (${limit})`);
    }

    // 3. Magic-byte sniff — anti-spoof
    const sniffed = sniffMime(buffer);
    if (!sniffed) {
      return fail(res, 400, 'Nao foi possivel identificar o tipo real do arquivo');
    }
    const sniffedKind = kindOf(sniffed);
    if (sniffedKind !== declaredKind) {
      console.warn('[WARN][API:content-planning/upload-media] MIME spoof detectado', {
        declared: mimeType, sniffed,
      });
      return fail(res, 400, 'Conteudo do arquivo nao corresponde ao tipo declarado');
    }

    // 4. Dimensoes
    let width = null;
    let height = null;
    if (declaredKind === 'image') {
      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width || null;
        height = meta.height || null;
      } catch (sharpErr) {
        console.warn('[WARN][API:content-planning/upload-media] sharp metadata falhou', { error: sharpErr.message });
        return fail(res, 400, 'Imagem corrompida ou em formato nao suportado');
      }
    } else if (dimensions && Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height)) {
      width = Math.round(dimensions.width);
      height = Math.round(dimensions.height);
    }

    // 5. Validacao por creativeType
    const rule = getRule(creativeType);
    if (rule) {
      // 5a. Kind permitido?
      if (!rule.allowedKinds.includes(sniffedKind)) {
        return fail(res, 400,
          `${rule.label} aceita apenas ${rule.allowedKinds.join(' ou ')}. Voce enviou ${sniffedKind}.`,
          { rule: { kind: rule.allowedKinds, hint: rule.hint } }
        );
      }
      // 5b. Aspecto (se temos dimensoes)
      if (width && height && !aspectInRange(width, height, rule)) {
        const got = describeAspect(width, height);
        return fail(res, 400,
          `Formato fora do esperado para ${rule.label} (${rule.targetLabel}). Recebido: ${got}.`,
          { rule: { target: rule.targetLabel, hint: rule.hint }, dimensions: { width, height } }
        );
      }
    }

    // 6. Grava arquivo
    const ext = MIME_EXTENSION[sniffed] ||
      (path.extname(fileName).slice(1).toLowerCase() || sniffed.split('/')[1] || 'bin');
    const safeName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const dirAbs = path.join(getStorageRoot(), 'content-planning', tenantId, planId);
    await fs.mkdir(dirAbs, { recursive: true });
    await fs.writeFile(path.join(dirAbs, safeName), buffer);

    const url = `/api/content-planning/media/${tenantId}/${planId}/${safeName}`;
    console.log('[SUCESSO][API:content-planning/upload-media]', {
      planId, fileName: safeName, size: buffer.length, kind: sniffedKind,
      width, height, creativeType: creativeType || null,
    });

    return res.status(201).json({
      success: true,
      url,
      fileName: safeName,
      size: buffer.length,
      mimeType: sniffed,
      kind: sniffedKind,
      width,
      height,
    });
  } catch (err) {
    console.error('[ERRO][API:content-planning/upload-media]', { error: err.message });
    return fail(res, 500, err.message);
  }
}
