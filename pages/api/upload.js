/**
 * pages/api/upload.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload de mídia (imagem ou vídeo) para `public/uploads/`.
 *
 * Validação backend (defesa em profundidade):
 *   · MIME pelo header do multipart  → primeira camada
 *   · Magic bytes (sniffing real do conteúdo) → segunda camada
 *   · Extensão derivada do MIME validado (NÃO confia no nome enviado)
 *   · Limite de tamanho: imagem ≤ 10MB, vídeo ≤ 100MB
 *   · Filename: regenerado, NUNCA usa o nome do cliente direto
 *
 * Retorna: { success, url, localPath, mimeType, sizeBytes }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '110mb', // overall request — vídeos podem ser grandes
  },
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const MIME_EXTENSION = {
  'image/jpeg':       'jpg',
  'image/png':        'png',
  'image/webp':       'webp',
  'image/gif':        'gif',
  'video/mp4':        'mp4',
  'video/quicktime':  'mov',
  'video/webm':       'webm',
};

/* ─────────────────────────────────────────────────────────────────────────────
   Magic bytes — sniff do conteúdo real (mais confiável que o header MIME)
───────────────────────────────────────────────────────────────────────────── */
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
    // ftypqt   → .mov
    if (buf[8] === 0x71 && buf[9] === 0x74) return 'video/quicktime';
    return 'video/mp4';
  }

  // WebM (Matroska): 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Parser multipart minimal — extrai 1 file do body
   (Mantém o mesmo estilo do upload original; usa Buffer real para evitar
   corrupção de bytes binários ao tratar como string)
───────────────────────────────────────────────────────────────────────────── */
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (parts.length > 0) {
      parts[parts.length - 1].end = idx;
    }
    parts.push({ start: idx + boundaryBuf.length, end: buffer.length });
    start = idx + boundaryBuf.length;
  }

  for (const part of parts) {
    const slice = buffer.slice(part.start, part.end);
    // Encontra fim do header (CRLF CRLF)
    const headerEnd = slice.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const headerStr = slice.slice(0, headerEnd).toString('utf8');
    if (!/Content-Disposition.*filename=/i.test(headerStr)) continue;

    const filenameMatch = headerStr.match(/filename="([^"]*)"/i);
    const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    const filename = filenameMatch?.[1] || 'upload.bin';
    const declaredMime = mimeMatch?.[1]?.trim() || 'application/octet-stream';

    // Body começa após CRLFCRLF, termina antes do CRLF que precede o próximo boundary
    let body = slice.slice(headerEnd + 4);
    // Remove o \r\n trailing do final do part
    if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
      body = body.slice(0, body.length - 2);
    }
    return { filename, declaredMime, body };
  }
  return null;
}

export default async function handler(req, res) {
  console.log('[INFO][API:/api/upload] requisição', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    // Lê o body completo
    const chunks = [];
    let totalSize = 0;
    for await (const chunk of req) {
      chunks.push(chunk);
      totalSize += chunk.length;
      // Hard cap absoluto pra prevenir DoS
      if (totalSize > MAX_VIDEO_BYTES + 1024 * 1024) {
        return res.status(413).json({ success: false, error: 'Arquivo excede o limite máximo (100MB)' });
      }
    }
    const buffer = Buffer.concat(chunks);

    // Extrai boundary
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"?)([^";]+)/i);
    if (!boundaryMatch) {
      return res.status(400).json({ success: false, error: 'Content-Type multipart/form-data inválido' });
    }
    const boundary = boundaryMatch[1];

    // Parse
    const parsed = parseMultipart(buffer, boundary);
    if (!parsed || !parsed.body || parsed.body.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    // ── VALIDAÇÃO 1: MIME declarado precisa estar na allowlist ──
    const declared = parsed.declaredMime.toLowerCase();
    const isImage = ALLOWED_IMAGE_MIMES.has(declared);
    const isVideo = ALLOWED_VIDEO_MIMES.has(declared);
    if (!isImage && !isVideo) {
      return res.status(400).json({
        success: false,
        error: `Tipo de arquivo não permitido. Aceitos: JPG, PNG, WebP, GIF, MP4, MOV, WebM`,
      });
    }

    // ── VALIDAÇÃO 2: tamanho ──
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (parsed.body.length > maxBytes) {
      const limit = isVideo ? '100MB' : '10MB';
      return res.status(413).json({
        success: false,
        error: `Arquivo muito grande. Máximo: ${limit}`,
      });
    }

    // ── VALIDAÇÃO 3: magic bytes (defesa contra spoof do MIME) ──
    const sniffed = sniffMime(parsed.body);
    if (!sniffed) {
      return res.status(400).json({
        success: false,
        error: 'Não foi possível identificar o tipo real do arquivo',
      });
    }

    // O MIME sniffado precisa ser do mesmo "tipo" do declarado
    // (imagem com imagem, vídeo com vídeo)
    const sniffedIsImage = ALLOWED_IMAGE_MIMES.has(sniffed);
    const sniffedIsVideo = ALLOWED_VIDEO_MIMES.has(sniffed);
    if ((isImage && !sniffedIsImage) || (isVideo && !sniffedIsVideo)) {
      console.warn('[WARN][upload] MIME spoof detectado', { declared, sniffed });
      return res.status(400).json({
        success: false,
        error: 'Conteúdo do arquivo não corresponde ao tipo declarado',
      });
    }

    // ── Filename seguro: regenerado, extensão pelo MIME real ──
    const ext = MIME_EXTENSION[sniffed] || 'bin';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const newFilename = `${uniqueSuffix}.${ext}`;

    const subfolder = sniffedIsVideo ? 'videos' : 'images';
    const uploadDir = join(process.cwd(), 'public', 'uploads', subfolder);
    await mkdir(uploadDir, { recursive: true }).catch(() => {});

    const filepath = join(uploadDir, newFilename);
    await writeFile(filepath, parsed.body);

    // URL pública (precisa estar acessível pra Meta baixar)
    // Prioridade: TUNNEL_URL > NEXT_PUBLIC_BASE_URL (geralmente ngrok/produção)
    // > NEXT_PUBLIC_APP_URL > localhost
    // Em dev a Meta NÃO consegue baixar de localhost — precisa de tunnel/ngrok.
    const candidateUrls = [
      process.env.TUNNEL_URL,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ]
      .map((u) => u?.trim())
      .filter(Boolean)
      // Prefere HTTPS (publicamente acessível) sobre localhost
      .sort((a, b) => {
        const aPub = a.startsWith('https://') && !a.includes('localhost');
        const bPub = b.startsWith('https://') && !b.includes('localhost');
        return (bPub ? 1 : 0) - (aPub ? 1 : 0);
      });

    const baseUrl = (candidateUrls[0] || `http://localhost:${process.env.PORT || 3001}`)
      .replace(/\/$/, '');

    const localPath = `/uploads/${subfolder}/${newFilename}`;
    const publicUrl = `${baseUrl}${localPath}`;

    console.log('[SUCESSO][API:/api/upload]', {
      filename: newFilename,
      size: parsed.body.length,
      mime: sniffed,
    });

    return res.json({
      success: true,
      url: publicUrl,
      localPath,
      mimeType: sniffed,
      sizeBytes: parsed.body.length,
      kind: sniffedIsVideo ? 'video' : 'image',
    });
  } catch (err) {
    console.error('[ERRO][API:/api/upload]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: 'Erro interno ao salvar arquivo' });
  }
}
