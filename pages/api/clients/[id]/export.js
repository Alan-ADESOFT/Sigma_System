/**
 * @fileoverview Endpoint: Exportar base estratégica como DOCX ou PDF
 * @route GET /api/clients/[id]/export?format=docx|pdf&stageKeys=all|diagnosis,competitors,...
 *
 * DOCX: gerado via biblioteca 'docx'
 * PDF:  HTML renderizado com CSS de impressão (download como .html para abrir e imprimir)
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query, queryOne } from '../../../../infra/db';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';

const STAGE_ORDER = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning'];

const STAGE_LABELS = {
  diagnosis:   'Diagnóstico do Negócio',
  competitors: 'Análise de Concorrentes',
  audience:    'Público-Alvo',
  avatar:      'Construção do Avatar',
  positioning: 'Posicionamento da Marca',
};

const STAGE_KB_CATEGORIES = {
  diagnosis:   ['diagnostico'],
  competitors: ['concorrentes'],
  audience:    ['publico_alvo'],
  avatar:      ['avatar'],
  positioning: ['posicionamento'],
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;
  const format   = req.query.format || 'docx';
  const stageKeysParam = req.query.stageKeys || 'all';

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
  }

  try {
    // Busca dados do cliente
    const client = await queryOne(
      'SELECT company_name, niche, region FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Determina etapas a incluir
    let stageKeys = STAGE_ORDER;
    if (stageKeysParam !== 'all') {
      stageKeys = stageKeysParam.split(',').filter(k => STAGE_ORDER.includes(k));
    }

    // Se pediu somente concluídas, filtra
    if (req.query.onlyDone === 'true') {
      const stages = await query(
        `SELECT stage_key FROM marketing_stages WHERE client_id = $1 AND status = 'done'`,
        [clientId]
      );
      const doneKeys = new Set(stages.map(s => s.stage_key));
      stageKeys = stageKeys.filter(k => doneKeys.has(k));
    }

    // Busca outputs da KB para cada etapa
    const sections = [];
    for (const key of stageKeys) {
      const categories = STAGE_KB_CATEGORIES[key] || [];
      const row = await queryOne(
        `SELECT value FROM ai_knowledge_base
         WHERE client_id = $1 AND tenant_id = $2 AND category = ANY($3)
         ORDER BY updated_at DESC LIMIT 1`,
        [clientId, tenantId, categories]
      );
      sections.push({
        stageKey: key,
        label: STAGE_LABELS[key] || key,
        content: row?.value || '(Etapa ainda não executada)',
      });
    }

    const dateStr = new Date().toLocaleDateString('pt-BR');
    const safeName = (client.company_name || 'cliente').replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-');

    // ── DOCX ──────────────────────────────────────────────────────────────
    if (format === 'docx') {
      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: 'Calibri', size: 22 },
            },
          },
        },
        sections: [{
          properties: {},
          children: [
            // Capa
            new Paragraph({ spacing: { before: 3000 } }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'BASE DE DADOS ESTRATÉGICA', bold: true, size: 36, font: 'Calibri' })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [new TextRun({ text: 'SIGMA MARKETING', size: 24, color: 'CC0029' })],
            }),
            new Paragraph({ spacing: { after: 600 } }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: client.company_name || '', bold: true, size: 32 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({ text: [client.niche, client.region].filter(Boolean).join(' | '), size: 22, color: '666666' }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 400 },
              children: [new TextRun({ text: `Gerado em ${dateStr}`, size: 20, color: '999999', italics: true })],
            }),

            // Sumário
            new Paragraph({ spacing: { before: 1200 } }),
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: 'SUMÁRIO', bold: true })],
            }),
            ...sections.map((s, i) => new Paragraph({
              spacing: { after: 80 },
              children: [new TextRun({ text: `${i + 1}. ${s.label}`, size: 22 })],
            })),

            // Separador
            new Paragraph({
              spacing: { before: 600 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
            }),

            // Seções
            ...sections.flatMap((s, i) => {
              const lines = s.content.split('\n').filter(l => l.trim());
              return [
                new Paragraph({ spacing: { before: 600 } }),
                new Paragraph({
                  heading: HeadingLevel.HEADING_1,
                  children: [new TextRun({ text: `${i + 1}. ${s.label}`, bold: true })],
                }),
                new Paragraph({
                  border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
                  spacing: { after: 200 },
                }),
                ...lines.map(line => {
                  // Detecta headers markdown
                  const h2Match = line.match(/^#{1,3}\s+(.+)/);
                  if (h2Match) {
                    return new Paragraph({
                      spacing: { before: 200, after: 100 },
                      children: [new TextRun({ text: h2Match[1], bold: true, size: 24 })],
                    });
                  }
                  // Detecta bullets
                  const bulletMatch = line.match(/^[-•]\s+(.+)/);
                  if (bulletMatch) {
                    return new Paragraph({
                      spacing: { after: 40 },
                      children: [new TextRun({ text: `  \u2022  ${bulletMatch[1]}`, size: 22 })],
                    });
                  }
                  // Detecta bold **texto**
                  const hasBold = line.includes('**');
                  if (hasBold) {
                    const parts = line.split(/\*\*(.+?)\*\*/g);
                    return new Paragraph({
                      spacing: { after: 60 },
                      children: parts.map((p, idx) =>
                        new TextRun({ text: p, bold: idx % 2 === 1, size: 22 })
                      ),
                    });
                  }
                  return new Paragraph({
                    spacing: { after: 60 },
                    children: [new TextRun({ text: line, size: 22 })],
                  });
                }),
              ];
            }),
          ],
        }],
      });

      const buffer = await Packer.toBuffer(doc);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="base-estrategica-${safeName}-${dateStr}.docx"`);
      return res.send(buffer);
    }

    // ── PDF (via HTML com CSS de impressão) ────────────────────────────────
    if (format === 'pdf') {
      const htmlSections = sections.map((s, i) => {
        const contentHtml = s.content
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/^### (.+)$/gm, '<h4>$1</h4>')
          .replace(/^## (.+)$/gm, '<h3>$1</h3>')
          .replace(/^# (.+)$/gm, '<h2>$1</h2>')
          .replace(/^[-\u2022] (.+)$/gm, '<li>$1</li>')
          .replace(/\n/g, '<br>');
        return `<div class="section"><h2>${i + 1}. ${s.label}</h2><div class="content">${contentHtml}</div></div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Base Estratégica - ${client.company_name}</title>
<style>
  @media print { body { margin: 0; } .no-print { display: none; } }
  body { font-family: 'Segoe UI', Calibri, sans-serif; color: #222; max-width: 800px; margin: 0 auto; padding: 40px 30px; line-height: 1.6; }
  .cover { text-align: center; padding: 80px 0 40px; border-bottom: 2px solid #cc0029; margin-bottom: 40px; }
  .cover h1 { font-size: 1.8rem; color: #cc0029; margin: 0 0 8px; letter-spacing: 0.1em; }
  .cover .brand { font-size: 0.9rem; color: #999; }
  .cover .client { font-size: 1.5rem; margin: 30px 0 10px; }
  .cover .meta { font-size: 0.85rem; color: #888; }
  .section { margin-bottom: 36px; page-break-inside: avoid; }
  .section h2 { font-size: 1.2rem; border-bottom: 1px solid #ddd; padding-bottom: 6px; color: #333; }
  .content { font-size: 0.9rem; }
  .content h3, .content h4 { color: #444; margin: 16px 0 6px; }
  .content li { margin-left: 20px; margin-bottom: 4px; }
  strong { color: #111; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 20px; background: #cc0029; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
<div class="cover">
  <h1>BASE DE DADOS ESTRATÉGICA</h1>
  <div class="brand">SIGMA MARKETING</div>
  <div class="client"><strong>${client.company_name || ''}</strong></div>
  <div class="meta">${[client.niche, client.region].filter(Boolean).join(' | ')}</div>
  <div class="meta" style="margin-top:16px">Gerado em ${dateStr}</div>
</div>
${htmlSections}
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="base-estrategica-${safeName}-${dateStr}.html"`);
      return res.send(html);
    }

    return res.status(400).json({ success: false, error: 'format deve ser docx ou pdf' });
  } catch (err) {
    console.error('[ERRO][API:export]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
