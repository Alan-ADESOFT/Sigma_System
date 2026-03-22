/**
 * @fileoverview Endpoint: Exportar base estrategica como DOCX ou PDF (HTML)
 * @route GET /api/clients/[id]/export?format=docx|pdf&stageKeys=all|done&onlyDone=true
 *
 * DOCX: design profissional SIGMA com capa, sumario, secoes formatadas
 * PDF:  HTML estilizado com CSS de impressao + botao window.print()
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query, queryOne } from '../../../../infra/db';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, ShadingType, PageBreak, Footer,
  Header, Tab, TabStopPosition, TabStopType,
} from 'docx';

const STAGE_ORDER = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning'];

const STAGE_LABELS = {
  diagnosis:   'Diagnostico do Negocio',
  competitors: 'Analise de Concorrentes',
  audience:    'Publico-Alvo',
  avatar:      'Construcao do Avatar',
  positioning: 'Posicionamento da Marca',
};

const STAGE_KB_CATEGORIES = {
  diagnosis:   ['diagnostico'],
  competitors: ['concorrentes'],
  audience:    ['publico_alvo'],
  avatar:      ['avatar'],
  positioning: ['posicionamento'],
};

const MONTHS_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatDateLong(d) {
  return MONTHS_PT[d.getMonth()] + ' de ' + d.getFullYear();
}

/**
 * Parseia markdown simples em array de Paragraphs docx
 */
function parseMarkdownToDocx(text, stageIndex) {
  const lines = text.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Headers markdown
    const h3Match = trimmed.match(/^###\s+(.+)/);
    if (h3Match) {
      paragraphs.push(new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: h3Match[1], bold: true, size: 24, font: 'Arial' })],
      }));
      continue;
    }
    const h2Match = trimmed.match(/^##\s+(.+)/);
    if (h2Match) {
      paragraphs.push(new Paragraph({
        spacing: { before: 240, after: 100 },
        children: [new TextRun({ text: h2Match[1], bold: true, size: 26, font: 'Arial', color: 'CC0022' })],
      }));
      continue;
    }
    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match) {
      paragraphs.push(new Paragraph({
        spacing: { before: 300, after: 120 },
        children: [new TextRun({ text: h1Match[1], bold: true, size: 28, font: 'Arial' })],
      }));
      continue;
    }

    // Bullets
    const bulletMatch = trimmed.match(/^[-\u2022*]\s+(.+)/);
    if (bulletMatch) {
      const bulletText = bulletMatch[1];
      paragraphs.push(new Paragraph({
        spacing: { after: 40 },
        indent: { left: 400 },
        children: parseBoldItalic('\u2022  ' + bulletText),
      }));
      continue;
    }

    // Normal paragraph with bold/italic
    paragraphs.push(new Paragraph({
      spacing: { after: 60 },
      children: parseBoldItalic(trimmed),
    }));
  }

  return paragraphs;
}

/**
 * Parseia **bold** e *italic* em TextRun[]
 */
function parseBoldItalic(text) {
  const runs = [];
  // Split on **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size: 22, font: 'Arial' }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, size: 22, font: 'Arial' }));
    } else if (part) {
      runs.push(new TextRun({ text: part, size: 22, font: 'Arial' }));
    }
  }
  return runs;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;
  const format   = req.query.format || 'docx';
  const onlyDone = req.query.onlyDone === 'true';

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId e obrigatorio' });
  }

  try {
    console.log('[INFO][API:export] Gerando export', { clientId, format, onlyDone });

    // Busca dados do cliente
    const client = await queryOne(
      'SELECT company_name, niche, region FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente nao encontrado' });
    }

    // Determina etapas a incluir
    let stageKeys = [...STAGE_ORDER];
    if (onlyDone) {
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
        content: row?.value || '(Etapa ainda nao executada)',
      });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const dateLong = formatDateLong(now);
    const safeName = (client.company_name || 'cliente').replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-');

    // ── DOCX (design profissional SIGMA) ──────────────────────────────────
    if (format === 'docx') {
      const doc = new Document({
        styles: {
          default: {
            document: {
              run: { font: 'Arial', size: 22 },
            },
          },
        },
        sections: [
          // ── CAPA ──
          {
            properties: {
              page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
            },
            children: [
              new Paragraph({ spacing: { before: 4000 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'SIGMA', bold: true, size: 96, font: 'Arial', color: 'CC0022' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                children: [new TextRun({ text: 'Base Estrategica', size: 36, font: 'Arial', color: 'FFFFFF' })],
                shading: { type: ShadingType.CLEAR, fill: '0A0A0A' },
              }),
              new Paragraph({ spacing: { after: 600 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: client.company_name || '', bold: true, size: 56, font: 'Arial', color: 'CC0022' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({ text: client.niche || '', size: 28, font: 'Arial', color: '666666' })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 400 },
                children: [new TextRun({ text: dateLong, size: 24, font: 'Arial', color: '999999', italics: true })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 200 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CC0022' } },
              }),
              new Paragraph({ spacing: { before: 2000 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Documento Confidencial', size: 20, font: 'Arial', color: 'AAAAAA', italics: true })],
              }),
            ],
          },
          // ── SUMARIO ──
          {
            properties: {
              page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
            },
            headers: {
              default: new Header({
                children: [new Paragraph({
                  children: [new TextRun({ text: 'SIGMA Marketing', size: 16, font: 'Arial', color: '999999' })],
                })],
              }),
            },
            footers: {
              default: new Footer({
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'SIGMA \u00B7 Confidencial \u00B7 ' + (client.company_name || ''), size: 16, font: 'Arial', color: '999999' })],
                })],
              }),
            },
            children: [
              new Paragraph({
                spacing: { after: 300 },
                children: [new TextRun({ text: 'Indice', bold: true, size: 36, font: 'Arial', color: 'CC0022' })],
              }),
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CC0022' } },
                spacing: { after: 300 },
              }),
              ...sections.map((s, i) => new Paragraph({
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: String(i + 1).padStart(2, '0') + '  ', bold: true, size: 22, font: 'Arial', color: 'CC0022' }),
                  new TextRun({ text: s.label, size: 22, font: 'Arial' }),
                ],
              })),
            ],
          },
          // ── SECOES ──
          ...sections.map((s, i) => ({
            properties: {
              page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
            },
            headers: {
              default: new Header({
                children: [new Paragraph({
                  children: [new TextRun({ text: 'SIGMA Marketing', size: 16, font: 'Arial', color: '999999' })],
                })],
              }),
            },
            footers: {
              default: new Footer({
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'SIGMA \u00B7 Confidencial \u00B7 ' + (client.company_name || ''), size: 16, font: 'Arial', color: '999999' })],
                })],
              }),
            },
            children: [
              // Header de secao
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: String(i + 1).padStart(2, '0'), bold: true, size: 48, font: 'Arial', color: 'CC0022' })],
              }),
              new Paragraph({
                spacing: { after: 100 },
                children: [new TextRun({ text: s.label, bold: true, size: 32, font: 'Arial' })],
              }),
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CC0022' } },
                spacing: { after: 300 },
              }),
              // Conteudo formatado
              ...parseMarkdownToDocx(s.content, i),
            ],
          })),
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      console.log('[SUCESSO][API:export] DOCX gerado', { clientId, size: buffer.length });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="SIGMA-Base-Estrategica-${safeName}.docx"`);
      return res.send(buffer);
    }

    // ── PDF (HTML com CSS de impressao) ──────────────────────────────────
    if (format === 'pdf') {
      const htmlSections = sections.map((s, i) => {
        const contentHtml = s.content
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/^### (.+)$/gm, '<h4>$1</h4>')
          .replace(/^## (.+)$/gm, '<h3>$1</h3>')
          .replace(/^# (.+)$/gm, '<h2 class="section-h2">$1</h2>')
          .replace(/^[-\u2022] (.+)$/gm, '<li>$1</li>')
          .replace(/\n/g, '<br>');
        return `<div class="secao">
          <div class="header-secao">
            <span class="secao-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="secao-label">${s.label}</span>
          </div>
          <div class="secao-content">${contentHtml}</div>
        </div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>SIGMA - Base Estrategica - ${client.company_name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; line-height: 1.7; }
  @media screen {
    body { max-width: 900px; margin: 0 auto; padding: 0; background: #f5f5f5; }
  }
  @media print {
    body { margin: 0; background: #fff; }
    .no-print { display: none !important; }
    .capa { page-break-after: always; }
    .secao { page-break-before: always; }
  }

  /* Capa */
  .capa {
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #0a0a0a; color: #fff; text-align: center;
    padding: 60px 40px;
  }
  .capa-brand { font-size: 3.5rem; font-weight: 800; color: #CC0022; letter-spacing: 0.15em; margin-bottom: 4px; }
  .capa-sub { font-size: 1.1rem; color: #888; margin-bottom: 60px; }
  .capa-client { font-size: 2rem; font-weight: 700; color: #CC0022; margin-bottom: 8px; }
  .capa-niche { font-size: 1rem; color: #666; margin-bottom: 40px; }
  .capa-date { font-size: 0.9rem; color: #555; font-style: italic; }
  .capa-line { width: 120px; height: 2px; background: #CC0022; margin: 30px auto; }
  .capa-conf { font-size: 0.75rem; color: #444; margin-top: auto; }

  /* Secoes */
  .secao { padding: 40px; }
  .header-secao {
    display: flex; align-items: baseline; gap: 12px;
    border-bottom: 3px solid #CC0022; padding-bottom: 12px; margin-bottom: 24px;
  }
  .secao-num { font-size: 2.5rem; font-weight: 800; color: #CC0022; }
  .secao-label { font-size: 1.3rem; font-weight: 700; color: #222; }
  .secao-content { font-size: 0.95rem; line-height: 1.8; }
  .secao-content h2, .secao-content h3, .secao-content h4 { color: #333; margin: 20px 0 8px; }
  .secao-content h3 { font-size: 1.1rem; color: #CC0022; }
  .secao-content li { margin-left: 24px; margin-bottom: 4px; list-style: disc; }
  .secao-content strong { color: #111; }

  /* Botao de print */
  .print-btn {
    position: fixed; top: 16px; right: 16px; padding: 10px 24px;
    background: #CC0022; color: #fff; border: none; border-radius: 8px;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
    box-shadow: 0 4px 12px rgba(204,0,34,0.3); z-index: 100;
  }
  .print-btn:hover { background: #990019; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
<div class="capa">
  <div class="capa-brand">SIGMA</div>
  <div class="capa-sub">Base Estrategica</div>
  <div class="capa-client">${client.company_name || ''}</div>
  <div class="capa-niche">${client.niche || ''}</div>
  <div class="capa-date">${dateLong}</div>
  <div class="capa-line"></div>
  <div class="capa-conf">Documento Confidencial</div>
</div>
${htmlSections}
</body></html>`;

      console.log('[SUCESSO][API:export] HTML/PDF gerado', { clientId });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="SIGMA-Base-Estrategica-${safeName}.html"`);
      return res.send(html);
    }

    return res.status(400).json({ success: false, error: 'format deve ser docx ou pdf' });
  } catch (err) {
    console.error('[ERRO][API:export]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
