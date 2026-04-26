/**
 * @fileoverview POST /api/image/brandbook/:clientId/extract
 * @description Recebe arquivo PDF/HTML (já salvo em /uploads/brandbooks/) ou
 * texto bruto e estrutura via LLM. NÃO persiste ainda — devolve o JSON
 * estruturado para o usuário revisar antes de chamar POST /brandbook/:clientId.
 *
 * Body aceito:
 *   { text: "..." [+ source: 'pdf'|'html'|'manual_description'] }
 *   OU
 *   { fileUrl: "/uploads/brandbooks/...", source: 'pdf'|'html', fileName, mimeType }
 *
 * Quando fileUrl é passado, lê o arquivo do disco e extrai texto via pdf-parse/mammoth.
 */

const path = require('path');
const fs = require('fs').promises;
const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../../../lib/api-auth');
const { extractFromText } = require('../../../../../models/agentes/imagecreator/brandbookExtractor');

const MAX_BYTES = parseInt(process.env.IMAGE_MAX_BRANDBOOK_BYTES || '26214400', 10);

async function readUploadedText(internalUrl, mimeType) {
  if (!internalUrl?.startsWith('/uploads/') || internalUrl.includes('..')) {
    throw new Error('fileUrl inválido (deve começar com /uploads/)');
  }
  const fullPath = path.join(process.cwd(), 'public', internalUrl);
  const stat = await fs.stat(fullPath);
  if (stat.size > MAX_BYTES) {
    throw new Error(`Arquivo excede o limite de ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB`);
  }
  const buf = await fs.readFile(fullPath);

  if ((mimeType || '').includes('pdf')) {
    const pdf = require('pdf-parse');
    const data = await pdf(buf);
    return data.text || '';
  }
  if ((mimeType || '').includes('html') || (mimeType || '').includes('text/html')) {
    return buf.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if ((mimeType || '').includes('plain') || (mimeType || '').includes('text')) {
    return buf.toString('utf8');
  }
  // docx? Aproveita mammoth se disponível
  if ((mimeType || '').includes('officedocument.wordprocessingml')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || '';
  }
  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
}

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { clientId } = req.query;
  const { text, fileUrl, source, fileName, mimeType, fileSize } = req.body || {};

  if (!source) {
    return res.status(400).json({ success: false, error: 'source obrigatório (pdf|html|manual_description)' });
  }

  let extractedText = text || '';
  try {
    if (!extractedText && fileUrl) {
      extractedText = await readUploadedText(fileUrl, mimeType);
    }
    if (!extractedText || extractedText.length < 30) {
      return res.status(400).json({ success: false, error: 'Texto extraído vazio ou muito curto' });
    }

    const result = await extractFromText({
      text: extractedText,
      source,
      tenantId, userId: user.id, clientId,
    });

    return res.json({
      success: true,
      data: {
        structured_data: result.structuredData,
        extracted_text: extractedText.slice(0, 30000),
        file_url: fileUrl || null,
        file_name: fileName || null,
        file_size: fileSize || null,
        mime_type: mimeType || null,
        tokens: { input: result.tokensInput, output: result.tokensOutput },
        model_used: result.modelUsed,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:image/brandbook/extract]', { error: err.message });
    return res.status(400).json({ success: false, error: err.message });
  }
}
