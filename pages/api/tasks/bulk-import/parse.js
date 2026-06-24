/**
 * pages/api/tasks/bulk-import/parse.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/tasks/bulk-import/parse
 *
 * Aceita:
 *   • multipart/form-data com campo "file" (.txt/.md/.docx/.pdf) opcional
 *     e/ou campo de texto "text"
 *   • application/json com { text, referenceWeek? }
 *
 * Fluxo:
 *   1. Extrai texto (do arquivo se houver, senão do campo "text")
 *   2. Carrega contexto do workspace (users / clients / categorias)
 *   3. Chama models/tasks/bulkImportAI.parseBulkImport
 *   4. Devolve { success, tasks, warnings, meta }
 *
 * Por que aceitamos JSON E multipart: a UI usa multipart só quando o usuário
 * sobe arquivo; pra "colar texto" mandamos JSON simples e economizamos um
 * round-trip de parsing.
 *
 * Tracking: tenantId é passado pra runCompletion (logUsage automático).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAdmin } = require('../../../../lib/api-auth');
const { query } = require('../../../../infra/db');
const { extractFromPDF, extractFromDOCX } = require('../../../../infra/api/fileReader');
const { parseBulkImport } = require('../../../../models/tasks/bulkImportAI');
const { ensureDefaultCategories } = require('../../../../models/taskCategory.model');

// Multipart precisa do body parser desligado (extraímos manualmente)
export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '6mb',
  },
};

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB conforme spec
const ALLOWED_EXTS = ['.txt', '.md', '.docx', '.pdf'];

/* ─── Multipart parser minimalista (mesma estratégia do transcribe-audio) ─── */

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, contentType) {
  const match = contentType.match(/boundary=(.+)$/);
  if (!match) throw new Error('Content-Type sem boundary');
  const boundary = '--' + match[1];
  const boundaryBuf = Buffer.from(boundary);

  const indices = [];
  let idx = buffer.indexOf(boundaryBuf, 0);
  while (idx !== -1) {
    indices.push(idx);
    idx = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
  }

  const parts = [];
  for (let i = 0; i < indices.length - 1; i++) {
    const partStart = indices[i] + boundaryBuf.length + 2;
    const partEnd = indices[i + 1] - 2;
    const part = parsePart(buffer.slice(partStart, partEnd));
    if (part) parts.push(part);
  }
  return parts;
}

function parsePart(buffer) {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const headerStr = buffer.slice(0, headerEnd).toString('utf8');
  const body = buffer.slice(headerEnd + 4);

  const disp = headerStr.match(/Content-Disposition:.*?name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
  if (!disp) return null;

  const name = disp[1];
  const filename = disp[2] || null;
  const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
  const contentType = ctMatch ? ctMatch[1].trim() : null;

  return filename
    ? { name, filename, contentType, data: body }
    : { name, value: body.toString('utf8') };
}

/* ─── Extração de texto por extensão ─────────────────────────────────────── */

async function extractTextFromFile(filename, buffer) {
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    throw new Error(`Extensão "${ext}" não suportada. Use ${ALLOWED_EXTS.join(', ')}.`);
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`Arquivo excede ${MAX_FILE_BYTES / 1024 / 1024}MB.`);
  }

  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf8');
  }
  if (ext === '.pdf') {
    const r = await extractFromPDF(buffer, { fileName: filename });
    if (!r.success) throw new Error(r.reason || 'Falha ao ler PDF');
    return r.text;
  }
  if (ext === '.docx') {
    const r = await extractFromDOCX(buffer, { fileName: filename });
    if (!r.success) throw new Error(r.reason || 'Falha ao ler DOCX');
    return r.text;
  }
  return '';
}

/* ─── Semana de referência ───────────────────────────────────────────────── */

function startOfWeekIso(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // segunda
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/* ─── Handler ────────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    // Importação em massa é restrita a admin/god.
    const user = await requireAdmin(req);
    const tenantId = await resolveTenantId(req);

    let text = '';
    let referenceWeek = null;

    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) {
      const buf = await readBody(req);
      const parts = parseMultipart(buf, ct);
      for (const p of parts) {
        if (p.filename) {
          console.log('[INFO][bulkImport/parse] arquivo recebido', { name: p.filename, bytes: p.data.length });
          text += '\n\n' + (await extractTextFromFile(p.filename, p.data));
        } else if (p.name === 'text' && p.value) {
          text += '\n\n' + p.value;
        } else if (p.name === 'referenceWeek' && p.value) {
          referenceWeek = p.value;
        }
      }
    } else {
      // JSON
      const buf = await readBody(req);
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch {}
      text = body.text || '';
      referenceWeek = body.referenceWeek || null;
    }

    text = text.trim();
    if (!text) {
      return res.status(400).json({ success: false, error: 'Nenhum texto ou arquivo válido foi enviado.' });
    }

    if (!referenceWeek) {
      referenceWeek = startOfWeekIso(new Date());
    }

    // Garante as 6 categorias fixas antes de montar o contexto da IA.
    await ensureDefaultCategories(tenantId);

    // Contexto do workspace — usuários ativos, clientes ativos, categorias
    const [users, clients, categories] = await Promise.all([
      query(
        `SELECT id, name FROM tenants
          WHERE is_active = true AND name IS NOT NULL
          ORDER BY name ASC`
      ),
      query(
        `SELECT id, company_name FROM marketing_clients
          WHERE tenant_id = $1
          ORDER BY company_name ASC`,
        [tenantId]
      ),
      query(
        `SELECT id, name FROM task_categories
          WHERE tenant_id = $1
          ORDER BY name ASC`,
        [tenantId]
      ),
    ]);

    const result = await parseBulkImport({
      text,
      users,
      clients,
      categories,
      referenceWeek,
      fallbackUserId: user.id,
      tenantId,
    });

    console.log('[SUCESSO][bulkImport/parse]', {
      userId: user.id, tasks: result.tasks.length, warnings: result.warnings.length,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][bulkImport/parse]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
