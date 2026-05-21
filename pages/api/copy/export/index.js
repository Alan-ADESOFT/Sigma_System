/**
 * @fileoverview Endpoint: criar job de export OU obter preview HTML
 * @route POST /api/copy/export
 *
 * Body: {
 *   sessionId: string,
 *   template:  'landing' | 'planning' | 'freeform',
 *   format:    'preview' | 'pdf' | 'docx',
 *   useBrandbook?: boolean,
 *   clientId?: string
 * }
 *
 * Quando format='preview' → retorna { success, html } sincronamente (~200ms),
 * usado pelo modal de pre-visualizacao em iframe.
 *
 * Quando format='pdf'|'docx' → cria copy_export_jobs (status=pending),
 * dispara processExportJob via setImmediate, retorna 202 + jobId. O cliente
 * faz polling em GET /api/copy/export/[jobId].
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import {
  createExportJob,
  processExportJob,
  buildHtmlForExport,
} from '../../../../models/copy/exportJobRunner';
import { queryOne } from '../../../../infra/db';

// Minimo de caracteres uteis (apos trim) pra permitir export. 30 chars
// cobre ate "headline curto + 1 frase". Abaixo disso quase certamente
// e teste em vazio ou rabisco — recusamos 400 com mensagem clara.
const MIN_CONTENT_CHARS = 30;

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const { sessionId, template, format, useBrandbook, clientId } = req.body || {};

  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId obrigatorio' });
  if (!['landing', 'planning', 'freeform'].includes(template)) {
    return res.status(400).json({ success: false, error: 'template deve ser landing | planning | freeform' });
  }
  if (!['preview', 'pdf', 'docx'].includes(format)) {
    return res.status(400).json({ success: false, error: 'format deve ser preview | pdf | docx' });
  }

  // ── Validacao de copy vazia (sprint v2.1, pos-feedback do usuario) ──
  // Carrega a sessao antes de criar o job pra recusar de cara se nao ha
  // copy suficiente. Evita: (a) gastar Sonnet 4.6 em rabiscos, (b) gerar
  // PDF "do nada" que confunde o operador, (c) job rodar e falhar adiante.
  let session;
  try {
    session = await queryOne(
      `SELECT id, output_text FROM copy_sessions WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Falha ao carregar sessao' });
  }
  if (!session) {
    return res.status(404).json({ success: false, error: 'Sessao nao encontrada' });
  }
  const cleanText = String(session.output_text || '').trim();
  if (cleanText.length < MIN_CONTENT_CHARS) {
    return res.status(400).json({
      success: false,
      error: cleanText.length === 0
        ? 'Sem copy pra exportar. Gere ou escreva um conteudo no editor antes de exportar.'
        : `Copy muito curta pra exportar (${cleanText.length} caracteres). Minimo de ${MIN_CONTENT_CHARS}.`,
      code: 'EMPTY_COPY',
    });
  }

  try {
    if (format === 'preview') {
      const html = await buildHtmlForExport({
        sessionId, tenantId, template,
        useBrandbook: useBrandbook !== false,
      });
      return res.json({ success: true, data: { html } });
    }

    // PDF/DOCX: cria job e dispara em background
    const job = await createExportJob({
      tenantId, sessionId, clientId, template, format,
      useBrandbook: useBrandbook !== false,
    });
    setImmediate(() => { processExportJob(job.id); });

    return res.status(202).json({
      success: true,
      data: { jobId: job.id, status: job.status },
    });

  } catch (err) {
    console.error('[ERRO][API:copy/export]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
