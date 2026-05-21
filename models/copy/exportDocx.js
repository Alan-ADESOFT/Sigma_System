/**
 * @fileoverview DOCX templates — versao SIGMA editorial fixa
 *
 * Sprint Copy v2.1: consome o JSON estruturado vindo do exportEnricher
 * (mesmo dado que alimenta os templates HTML). Renderiza com identidade
 * SIGMA hardcoded — preto/branco/vermelho, Inter+JetBrains Mono.
 *
 * Margens A4 20/18mm pra alinhar com o PDF. Footer "pagina X de Y" via
 * docx PageNumber. Cada section vira um bloco com estilo conforme kind.
 */

const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Footer, PageNumber, NumberFormat, PageBreak,
} = require('docx');

const SIGMA = {
  primary: 'CC0029',  // sem #
  ink:     '0A0A0A',
  body:    '1A1A1A',
  muted:   '5A5A5A',
};

const FONT_BODY = 'Inter';
const FONT_MONO = 'JetBrains Mono';

// ── Helpers ─────────────────────────────────────────────────────────────────

function _inline(text, opts = {}) {
  // Quebra **bold** e *italic* em runs preservando ordem.
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  const runs = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({
        text: part.slice(2, -2), bold: true, color: SIGMA.ink,
        size: opts.size || 22, font: FONT_BODY,
      }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({
        text: part.slice(1, -1), italics: true, color: SIGMA.primary,
        size: opts.size || 22, font: FONT_BODY,
      }));
    } else {
      runs.push(new TextRun({
        text: part, color: opts.color || SIGMA.body,
        size: opts.size || 22, font: FONT_BODY,
      }));
    }
  }
  return runs;
}

function _eyebrow(text, color = SIGMA.muted) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({
      text: String(text || '').toUpperCase(),
      bold: true, color, size: 14, font: FONT_MONO,
      characterSpacing: 32,
    })],
  });
}

function _content(text) {
  if (!text) return [];
  // Quebras duplas viram paragrafos separados
  return String(text).split(/\n\n+/).map(p =>
    new Paragraph({
      spacing: { after: 120 },
      children: _inline(p.replace(/\n/g, ' ')),
    })
  );
}

// ── Renderers por kind ──────────────────────────────────────────────────────

function _hero(sec) {
  return [
    _eyebrow(sec.eyebrow || 'ABERTURA', SIGMA.primary),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({
        text: sec.title || '', bold: true, color: SIGMA.ink,
        size: 52, font: FONT_BODY,
      })],
    }),
    ...(sec.content ? [new Paragraph({
      spacing: { after: 200 },
      children: _inline(sec.content, { size: 26, color: SIGMA.muted }),
    })] : []),
    new Paragraph({
      spacing: { after: 360 },
      children: [new TextRun({ text: '━━━━', color: SIGMA.primary, bold: true, size: 14, font: FONT_MONO })],
    }),
  ];
}

function _section(sec, idx) {
  const num = String(idx).padStart(2, '0');
  return [
    new Paragraph({
      spacing: { before: 280, after: 80 },
      border: { top: { color: 'D9D9D9', space: 4, style: 'single', size: 4 } },
      children: [
        new TextRun({ text: `${num}  `, bold: true, color: SIGMA.primary, size: 18, font: FONT_MONO }),
        new TextRun({
          text: String(sec.eyebrow || 'SECAO').toUpperCase(),
          bold: true, color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
        }),
      ],
    }),
    ...(sec.title ? [new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({
        text: sec.title, bold: true, color: SIGMA.ink, size: 32, font: FONT_BODY,
      })],
    })] : []),
    ..._content(sec.content),
  ];
}

function _callout(sec) {
  return [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      shading: { type: 'clear', color: 'F9F9FA', fill: 'F9F9FA' },
      border: { left: { color: SIGMA.primary, space: 8, style: 'single', size: 24 } },
      indent: { left: 200 },
      children: [new TextRun({
        text: String(sec.eyebrow || 'DESTAQUE').toUpperCase(),
        bold: true, color: SIGMA.primary, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    }),
    ...(sec.title ? [new Paragraph({
      spacing: { after: 80 },
      shading: { type: 'clear', color: 'F9F9FA', fill: 'F9F9FA' },
      indent: { left: 200 },
      children: [new TextRun({
        text: sec.title, bold: true, color: SIGMA.ink, size: 26, font: FONT_BODY,
      })],
    })] : []),
    new Paragraph({
      spacing: { after: 200 },
      shading: { type: 'clear', color: 'F9F9FA', fill: 'F9F9FA' },
      indent: { left: 200 },
      children: _inline(sec.content || '', { size: 21 }),
    }),
  ];
}

function _list(sec, idx) {
  const num = String(idx).padStart(2, '0');
  const items = Array.isArray(sec.items) ? sec.items : [];
  const out = [
    new Paragraph({
      spacing: { before: 240, after: 80 },
      border: { top: { color: 'D9D9D9', space: 4, style: 'single', size: 4 } },
      children: [
        new TextRun({ text: `${num}  `, bold: true, color: SIGMA.primary, size: 18, font: FONT_MONO }),
        new TextRun({
          text: String(sec.eyebrow || 'LISTA').toUpperCase(),
          bold: true, color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
        }),
      ],
    }),
  ];
  if (sec.title) out.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: sec.title, bold: true, color: SIGMA.ink, size: 32, font: FONT_BODY })],
  }));
  if (sec.content) out.push(...(_content(sec.content)));
  for (const it of items) {
    out.push(new Paragraph({
      spacing: { after: 80 }, indent: { left: 360 },
      children: [
        new TextRun({ text: '— ', bold: true, color: SIGMA.primary, size: 22, font: FONT_BODY }),
        ..._inline(String(it || '')),
      ],
    }));
  }
  return out;
}

function _quote(sec) {
  return [
    new Paragraph({
      spacing: { before: 240, after: 60 },
      border: { left: { color: SIGMA.primary, space: 12, style: 'single', size: 24 } },
      indent: { left: 240 },
      children: [new TextRun({ text: '"', bold: true, color: SIGMA.primary, size: 56, font: FONT_BODY })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      border: { left: { color: SIGMA.primary, space: 12, style: 'single', size: 24 } },
      indent: { left: 240 },
      children: _inline(sec.content || '', { size: 28 }).map(r => { r.italics = true; return r; }),
    }),
    ...(sec.attribution ? [new Paragraph({
      spacing: { after: 240 },
      border: { left: { color: SIGMA.primary, space: 12, style: 'single', size: 24 } },
      indent: { left: 240 },
      children: [new TextRun({
        text: `— ${sec.attribution}`.toUpperCase(),
        color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    })] : []),
  ];
}

function _cta(sec) {
  return [
    new Paragraph({
      spacing: { before: 320, after: 100 },
      shading: { type: 'clear', color: SIGMA.ink, fill: SIGMA.ink },
      indent: { left: 240, right: 240 },
      children: [new TextRun({
        text: String(sec.eyebrow || 'PROXIMO PASSO').toUpperCase(),
        bold: true, color: SIGMA.primary, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    }),
    ...(sec.title ? [new Paragraph({
      spacing: { after: 80 },
      shading: { type: 'clear', color: SIGMA.ink, fill: SIGMA.ink },
      indent: { left: 240, right: 240 },
      children: [new TextRun({
        text: sec.title, bold: true, color: 'FFFFFF', size: 32, font: FONT_BODY,
      })],
    })] : []),
    ...(sec.content ? [new Paragraph({
      spacing: { after: 240 },
      shading: { type: 'clear', color: SIGMA.ink, fill: SIGMA.ink },
      indent: { left: 240, right: 240 },
      children: _inline(sec.content, { size: 21, color: 'CCCCCC' }),
    })] : []),
  ];
}

function _faq(sec, idx) {
  const num = String(idx).padStart(2, '0');
  const qa = Array.isArray(sec.qa) ? sec.qa : [];
  const out = [
    new Paragraph({
      spacing: { before: 240, after: 80 },
      border: { top: { color: 'D9D9D9', space: 4, style: 'single', size: 4 } },
      children: [
        new TextRun({ text: `${num}  `, bold: true, color: SIGMA.primary, size: 18, font: FONT_MONO }),
        new TextRun({
          text: String(sec.eyebrow || 'FAQ').toUpperCase(),
          bold: true, color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
        }),
      ],
    }),
  ];
  if (sec.title) out.push(new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: sec.title, bold: true, color: SIGMA.ink, size: 32, font: FONT_BODY })],
  }));
  for (const item of qa) {
    out.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: item.question || '', bold: true, color: SIGMA.ink, size: 23, font: FONT_BODY })],
    }));
    out.push(new Paragraph({
      spacing: { after: 160 }, indent: { left: 200 },
      children: _inline(item.answer || '', { size: 21 }),
    }));
  }
  return out;
}

const RENDERERS = { hero: _hero, section: _section, callout: _callout, list: _list, quote: _quote, cta: _cta, faq: _faq };

// ── Cover + footer ─────────────────────────────────────────────────────────

function _cover({ structured, client, templateLabel }) {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const company = client?.company_name || 'SIGMA Marketing';
  return [
    new Paragraph({
      spacing: { before: 1800, after: 240 },
      children: [new TextRun({
        text: 'SIGMA · MARKETING',
        bold: true, color: SIGMA.muted, size: 16, font: FONT_MONO, characterSpacing: 36,
      })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({
        text: String(templateLabel || 'DOCUMENTO').toUpperCase(),
        bold: true, color: SIGMA.primary, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({
        text: structured?.documentTitle || 'Documento de Copy',
        bold: true, color: SIGMA.ink, size: 64, font: FONT_BODY,
      })],
    }),
    ...(structured?.documentSubtitle ? [new Paragraph({
      spacing: { after: 600 },
      children: [new TextRun({
        text: structured.documentSubtitle, color: SIGMA.muted, size: 26, font: FONT_BODY,
      })],
    })] : [new Paragraph({ spacing: { after: 600 }, children: [] })]),
    new Paragraph({
      border: { top: { color: 'D9D9D9', space: 4, style: 'single', size: 4 } },
      spacing: { before: 240, after: 80 },
      children: [new TextRun({
        text: 'CLIENTE', bold: true, color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: company, color: SIGMA.ink, size: 22, font: FONT_BODY })],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({
        text: 'GERADO EM', bold: true, color: SIGMA.muted, size: 14, font: FONT_MONO, characterSpacing: 32,
      })],
    }),
    new Paragraph({
      spacing: { after: 600 },
      children: [new TextRun({ text: date, color: SIGMA.ink, size: 22, font: FONT_BODY })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function _footer(client) {
  const company = client?.company_name || 'Sigma';
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${company} · `, size: 14, color: SIGMA.muted, font: FONT_MONO, characterSpacing: 24 }),
          new TextRun({ children: ['PAGINA ', PageNumber.CURRENT, ' DE ', PageNumber.TOTAL_PAGES], size: 14, color: SIGMA.muted, font: FONT_MONO, characterSpacing: 24 }),
        ],
      }),
    ],
  });
}

// ── Builder principal ──────────────────────────────────────────────────────

function _document({ structured, client, templateLabel }) {
  const cover = _cover({ structured, client, templateLabel });
  const sections = Array.isArray(structured?.sections) ? structured.sections : [];

  let blockIdx = 0;
  const body = [];
  for (const sec of sections) {
    const renderer = RENDERERS[sec.kind] || RENDERERS.section;
    if (['section', 'list', 'faq'].includes(sec.kind)) {
      blockIdx += 1;
      body.push(...renderer(sec, blockIdx));
    } else {
      body.push(...renderer(sec, blockIdx));
    }
  }

  return new Document({
    creator: 'Sigma Marketing',
    title: (structured?.documentTitle || 'Sigma') + ' — Copy',
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 1020, bottom: 1134, left: 1020 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      footers: { default: _footer(client) },
      children: [...cover, ...body],
    }],
  });
}

// ── API publica (mesma assinatura dos templates HTML) ──────────────────────

async function renderLandingDocx(args) {
  return Packer.toBuffer(_document({ ...args, templateLabel: 'LANDING PAGE — DOCUMENTO DE COPY' }));
}
async function renderPlanningDocx(args) {
  return Packer.toBuffer(_document({ ...args, templateLabel: 'PLANEJAMENTO DE CONTEUDO' }));
}
async function renderFreeformDocx(args) {
  return Packer.toBuffer(_document({ ...args, templateLabel: 'COPY EDITORIAL' }));
}

module.exports = { renderLandingDocx, renderPlanningDocx, renderFreeformDocx };
