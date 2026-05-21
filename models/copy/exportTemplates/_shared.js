/**
 * @fileoverview Helpers + builder editorial SIGMA pros templates de export
 * @description Sprint Copy v2.1 (maio/2026) — feedback do usuario.
 *
 * Mudou completamente em relacao a sprint anterior:
 *   1. Brandbook = SEMPRE SIGMA (preto/branco/vermelho editorial). Nao
 *      busca brandbook do cliente, nao tem fallback condicional.
 *   2. Renderer agora consome JSON estruturado vindo do exportEnricher
 *      (Sonnet 4.6) — antes consumia markdown bruto direto.
 *   3. Sections tipadas (hero/section/callout/list/cta/quote/faq)
 *      cada uma com layout dedicado, hierarquia visual clara.
 *   4. Identidade visual de revista de design:
 *      - eyebrows mono CAPS ("01 / SECAO")
 *      - divisores horizontais finos
 *      - barras laterais vermelhas em callouts
 *      - tipografia Inter+JetBrains Mono via Google Fonts
 *      - branco no body (impressao), acentos preto/vermelho
 */

// ── SIGMA — identidade fixa, hardcoded por design (feedback do usuario) ────
const SIGMA = {
  colors: {
    primary:    '#ff0033',
    primaryDk:  '#cc0029',
    ink:        '#0a0a0a',
    body:       '#1a1a1a',
    muted:      '#5a5a5a',
    line:       '#e5e5e5',
    paper:      '#ffffff',
    callout:    '#f9f9fa',
    invertBg:   '#0a0a0a',
    invertFg:   '#ffffff',
  },
  fonts: {
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Markdown inline minimo (negrito + italico + quebra de paragrafo).
 * Aplicado em content/items vindos do enricher. Escapa HTML antes.
 */
function inlineMd(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Quebras duplas viram paragrafos separados; quebras unicas viram <br>
  return out
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

// ── Renderers por kind de secao ─────────────────────────────────────────────

function renderHero(sec, idx) {
  return `
    <section class="sec sec-hero">
      <div class="eyebrow">${escapeHtml(sec.eyebrow || 'ABERTURA')}</div>
      <h1 class="hero-title">${escapeHtml(sec.title || '')}</h1>
      ${sec.content ? `<div class="hero-sub">${inlineMd(sec.content)}</div>` : ''}
      <div class="hero-rule"></div>
    </section>`;
}

function renderSection(sec, idx) {
  const num = String(idx).padStart(2, '0');
  return `
    <section class="sec sec-block">
      <div class="block-head">
        <span class="block-num">${num}</span>
        <span class="eyebrow">${escapeHtml(sec.eyebrow || 'SECAO')}</span>
      </div>
      ${sec.title ? `<h2 class="block-title">${escapeHtml(sec.title)}</h2>` : ''}
      <div class="block-body">${inlineMd(sec.content || '')}</div>
    </section>`;
}

function renderCallout(sec) {
  return `
    <aside class="sec sec-callout">
      <div class="callout-bar"></div>
      <div class="callout-inner">
        <div class="eyebrow eyebrow-red">${escapeHtml(sec.eyebrow || 'DESTAQUE')}</div>
        ${sec.title ? `<div class="callout-title">${escapeHtml(sec.title)}</div>` : ''}
        <div class="callout-body">${inlineMd(sec.content || '')}</div>
      </div>
    </aside>`;
}

function renderList(sec, idx) {
  const num = String(idx).padStart(2, '0');
  const items = Array.isArray(sec.items) ? sec.items : [];
  return `
    <section class="sec sec-list">
      <div class="block-head">
        <span class="block-num">${num}</span>
        <span class="eyebrow">${escapeHtml(sec.eyebrow || 'LISTA')}</span>
      </div>
      ${sec.title ? `<h2 class="block-title">${escapeHtml(sec.title)}</h2>` : ''}
      ${sec.content ? `<div class="block-body">${inlineMd(sec.content)}</div>` : ''}
      <ul class="sigma-list">
        ${items.map(it => `<li>${inlineMd(String(it || ''))}</li>`).join('')}
      </ul>
    </section>`;
}

function renderQuote(sec) {
  return `
    <section class="sec sec-quote">
      <div class="quote-mark">"</div>
      <blockquote class="quote-body">${inlineMd(sec.content || '')}</blockquote>
      ${sec.attribution ? `<div class="quote-attr">— ${escapeHtml(sec.attribution)}</div>` : ''}
    </section>`;
}

function renderCta(sec) {
  return `
    <section class="sec sec-cta">
      <div class="cta-eyebrow">${escapeHtml(sec.eyebrow || 'PROXIMO PASSO')}</div>
      ${sec.title ? `<div class="cta-title">${escapeHtml(sec.title)}</div>` : ''}
      ${sec.content ? `<div class="cta-body">${inlineMd(sec.content)}</div>` : ''}
    </section>`;
}

function renderFaq(sec, idx) {
  const num = String(idx).padStart(2, '0');
  const qa = Array.isArray(sec.qa) ? sec.qa : [];
  return `
    <section class="sec sec-faq">
      <div class="block-head">
        <span class="block-num">${num}</span>
        <span class="eyebrow">${escapeHtml(sec.eyebrow || 'FAQ')}</span>
      </div>
      ${sec.title ? `<h2 class="block-title">${escapeHtml(sec.title)}</h2>` : ''}
      ${qa.map(item => `
        <div class="faq-item">
          <div class="faq-q">${escapeHtml(item.question || '')}</div>
          <div class="faq-a">${inlineMd(item.answer || '')}</div>
        </div>
      `).join('')}
    </section>`;
}

const RENDERERS = {
  hero:    renderHero,
  section: renderSection,
  callout: renderCallout,
  list:    renderList,
  quote:   renderQuote,
  cta:     renderCta,
  faq:     renderFaq,
};

/**
 * Empilha o array de sections em HTML editorial. Numera as sections que
 * tem head numerado (block/list/faq) ignorando hero/callout/quote/cta.
 */
function renderSections(sections) {
  let blockIdx = 0;
  return sections.map((sec) => {
    const renderer = RENDERERS[sec.kind] || RENDERERS.section;
    if (['section', 'list', 'faq'].includes(sec.kind)) {
      blockIdx += 1;
      return renderer(sec, blockIdx);
    }
    return renderer(sec, blockIdx);
  }).join('\n');
}

// ── CSS SIGMA editorial — um lugar so, vai pro <style> de todos templates ──

const SIGMA_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${SIGMA.fonts.body};
    font-size: 11pt;
    line-height: 1.6;
    color: ${SIGMA.colors.body};
    background: ${SIGMA.colors.paper};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .doc { max-width: 100%; }

  /* ── Cover ───────────────────────────────────────────────── */
  .cover {
    page-break-after: always; break-after: page;
    padding: 60mm 0 0;
    position: relative;
  }
  .cover-brand {
    font-family: ${SIGMA.fonts.mono};
    font-size: 9pt; letter-spacing: 0.18em; text-transform: uppercase;
    color: ${SIGMA.colors.muted}; margin-bottom: 40pt;
    display: flex; align-items: center; gap: 10pt;
  }
  .cover-brand-mark {
    width: 8pt; height: 8pt;
    background: ${SIGMA.colors.primary};
    display: inline-block;
  }
  .cover-eyebrow {
    font-family: ${SIGMA.fonts.mono};
    font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${SIGMA.colors.primary}; margin-bottom: 14pt;
  }
  .cover-title {
    font-family: ${SIGMA.fonts.body};
    font-size: 36pt; font-weight: 700;
    line-height: 1.06; letter-spacing: -0.01em;
    color: ${SIGMA.colors.ink};
    margin: 0 0 14pt;
    max-width: 88%;
  }
  .cover-sub {
    font-size: 13pt; line-height: 1.45; color: ${SIGMA.colors.muted};
    max-width: 78%;
  }
  .cover-meta {
    margin-top: 60pt;
    border-top: 1pt solid ${SIGMA.colors.line};
    padding-top: 14pt;
    display: flex; gap: 40pt;
  }
  .cover-meta-item .label {
    font-family: ${SIGMA.fonts.mono};
    font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase;
    color: ${SIGMA.colors.muted};
  }
  .cover-meta-item .value {
    font-size: 10.5pt; color: ${SIGMA.colors.ink}; margin-top: 3pt; font-weight: 500;
  }

  /* ── Sections ────────────────────────────────────────────── */
  .sec { margin-bottom: 28pt; page-break-inside: avoid; break-inside: avoid; }

  .eyebrow {
    font-family: ${SIGMA.fonts.mono};
    font-size: 7.5pt; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${SIGMA.colors.muted};
  }
  .eyebrow-red { color: ${SIGMA.colors.primary}; }

  .block-head {
    display: flex; align-items: center; gap: 10pt;
    border-top: 1pt solid ${SIGMA.colors.line};
    padding-top: 8pt; margin-bottom: 8pt;
  }
  .block-num {
    font-family: ${SIGMA.fonts.mono};
    font-size: 9pt; font-weight: 600;
    color: ${SIGMA.colors.primary};
  }
  .block-title {
    font-size: 18pt; font-weight: 700;
    color: ${SIGMA.colors.ink};
    line-height: 1.2; margin: 0 0 10pt;
    letter-spacing: -0.005em;
    page-break-after: avoid; break-after: avoid;
  }
  .block-body p { margin: 0 0 9pt; orphans: 3; widows: 3; }
  .block-body p:last-child { margin-bottom: 0; }
  .block-body strong { color: ${SIGMA.colors.ink}; font-weight: 700; }
  .block-body em { color: ${SIGMA.colors.primary}; font-style: italic; }

  /* Hero */
  .sec-hero { margin-bottom: 32pt; }
  .hero-title {
    font-size: 26pt; font-weight: 700; line-height: 1.15;
    margin: 8pt 0 12pt; color: ${SIGMA.colors.ink};
    letter-spacing: -0.01em;
  }
  .hero-sub p { font-size: 13pt; color: ${SIGMA.colors.muted}; margin: 0; line-height: 1.5; }
  .hero-rule {
    width: 60pt; height: 3pt; background: ${SIGMA.colors.primary};
    margin-top: 20pt;
  }

  /* Callout */
  .sec-callout {
    display: flex; gap: 14pt;
    background: ${SIGMA.colors.callout};
    padding: 16pt 20pt;
    border-radius: 4pt;
  }
  .callout-bar {
    width: 3pt; background: ${SIGMA.colors.primary}; flex-shrink: 0; border-radius: 2pt;
  }
  .callout-inner { flex: 1; }
  .callout-title {
    font-size: 14pt; font-weight: 700; color: ${SIGMA.colors.ink};
    margin: 4pt 0 8pt; line-height: 1.3;
  }
  .callout-body p { margin: 0 0 6pt; font-size: 10.5pt; }

  /* List */
  .sigma-list { list-style: none; padding: 0; margin: 8pt 0 0; }
  .sigma-list li {
    position: relative; padding-left: 18pt; margin-bottom: 8pt;
    page-break-inside: avoid;
  }
  .sigma-list li::before {
    content: '';
    position: absolute; left: 0; top: 8pt;
    width: 8pt; height: 1.5pt; background: ${SIGMA.colors.primary};
  }

  /* Quote */
  .sec-quote {
    border-left: 3pt solid ${SIGMA.colors.primary};
    padding-left: 18pt; margin: 22pt 0;
  }
  .quote-mark {
    font-family: ${SIGMA.fonts.body}; font-size: 36pt; line-height: 0.8;
    color: ${SIGMA.colors.primary}; font-weight: 700; margin-bottom: 4pt;
  }
  .quote-body {
    margin: 0; font-size: 14pt; font-style: italic; line-height: 1.45;
    color: ${SIGMA.colors.ink};
  }
  .quote-attr {
    margin-top: 10pt; font-family: ${SIGMA.fonts.mono};
    font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase;
    color: ${SIGMA.colors.muted};
  }

  /* CTA — bloco invertido (preto SIGMA) */
  .sec-cta {
    background: ${SIGMA.colors.invertBg};
    color: ${SIGMA.colors.invertFg};
    padding: 22pt 24pt; border-radius: 4pt;
    margin-top: 24pt;
    page-break-inside: avoid;
  }
  .cta-eyebrow {
    font-family: ${SIGMA.fonts.mono};
    font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${SIGMA.colors.primary}; margin-bottom: 8pt;
  }
  .cta-title {
    font-size: 18pt; font-weight: 700; color: ${SIGMA.colors.invertFg};
    line-height: 1.25; margin-bottom: 10pt;
  }
  .cta-body p { color: rgba(255,255,255,0.78); font-size: 10.5pt; margin: 0; }

  /* FAQ */
  .faq-item { margin-bottom: 14pt; page-break-inside: avoid; }
  .faq-q {
    font-weight: 700; color: ${SIGMA.colors.ink};
    font-size: 11.5pt; margin-bottom: 4pt;
  }
  .faq-a p { margin: 0; color: ${SIGMA.colors.body}; font-size: 10.5pt; }

  /* Footer brand mark */
  .doc-footer {
    margin-top: 36pt; padding-top: 14pt;
    border-top: 1pt solid ${SIGMA.colors.line};
    display: flex; align-items: center; justify-content: space-between;
    font-family: ${SIGMA.fonts.mono};
    font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase;
    color: ${SIGMA.colors.muted};
  }
`;

/**
 * Empacota um documento HTML completo com identidade SIGMA, Google Fonts
 * e o body renderizado a partir das sections.
 */
function buildSigmaDocument({ title, sections, documentTitle, documentSubtitle, clientName, templateLabel }) {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const brandLine = clientName ? `${escapeHtml(clientName)} · SIGMA Marketing` : 'SIGMA Marketing';

  const cover = `
    <section class="cover">
      <div class="cover-brand">
        <span class="cover-brand-mark"></span>
        SIGMA · MARKETING
      </div>
      <div class="cover-eyebrow">${escapeHtml(templateLabel || 'DOCUMENTO')}</div>
      <h1 class="cover-title">${escapeHtml(documentTitle || 'Documento de Copy')}</h1>
      ${documentSubtitle ? `<div class="cover-sub">${escapeHtml(documentSubtitle)}</div>` : ''}
      <div class="cover-meta">
        ${clientName ? `<div class="cover-meta-item">
          <div class="label">Cliente</div>
          <div class="value">${escapeHtml(clientName)}</div>
        </div>` : ''}
        <div class="cover-meta-item">
          <div class="label">Gerado em</div>
          <div class="value">${date}</div>
        </div>
        <div class="cover-meta-item">
          <div class="label">Sistema</div>
          <div class="value">SIGMA Marketing</div>
        </div>
      </div>
    </section>`;

  const body = renderSections(sections || []);

  const footer = `
    <div class="doc-footer">
      <span>${brandLine}</span>
      <span>${date}</span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title || documentTitle || 'Sigma — Documento')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>${SIGMA_CSS}</style>
</head>
<body><div class="doc">${cover}${body}${footer}</div></body>
</html>`;
}

module.exports = {
  SIGMA,
  buildSigmaDocument,
  renderSections,
  escapeHtml,
  inlineMd,
};
