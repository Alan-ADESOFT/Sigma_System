/**
 * @fileoverview Wrapper Puppeteer pra render HTML -> PDF
 *
 * Funciona em dois modos:
 *   - Local (dev/macOS): tenta executar @sparticuz/chromium, e se falhar
 *     cai pro Chrome do sistema via PUPPETEER_EXECUTABLE_PATH.
 *   - Producao (Railway/Linux): usa @sparticuz/chromium, que ja vem com
 *     binario compatible com containers e baixo footprint de RAM.
 *
 * Margens A4 padrao: top/bottom 20mm, left/right 18mm. CSS dos templates
 * deve usar `page-break-inside: avoid` em todo card/secao pra garantir
 * que nada e cortado no meio.
 *
 * Footer com numeracao "pagina X de Y" injetado via Puppeteer (nao
 * depende do CSS do template).
 *
 * `await page.evaluateHandle('document.fonts.ready')` antes do printToPDF
 * garante que Google Fonts carregaram antes do snapshot.
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');

let _browserPromise = null;

/**
 * Detecta ambiente serverless/Linux onde @sparticuz/chromium roda.
 * Em macOS/Windows local o binario do Sparticuz nao executa
 * (`spawn ENOEXEC`) — precisa apontar pra um Chrome instalado no sistema.
 */
function isServerlessEnv() {
  return (
    process.platform === 'linux' &&
    (
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.NODE_ENV === 'production'
    )
  );
}

/**
 * Resolve o Chrome executavel pra ambiente local (dev). Busca:
 *   1. PUPPETEER_EXECUTABLE_PATH (override manual)
 *   2. Chrome.app no macOS
 *   3. Chrome em locais conhecidos do Linux/Windows
 * Retorna null se nada encontrado — caller deve mostrar mensagem util.
 */
function resolveLocalChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    );
  } else if (process.platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    );
  }
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * Abre (ou reaproveita) uma instancia singleton do Chromium.
 *
 * IMPORTANTE: o binario do @sparticuz/chromium e compilado pra Linux x64
 * em ambientes serverless (Lambda/Vercel/Railway). Em macOS/Windows local
 * ele lanca `spawn ENOEXEC`. Por isso a logica abaixo escolhe:
 *   · prod Linux  → @sparticuz/chromium
 *   · dev local   → Chrome do sistema (busca em locais conhecidos)
 */
async function getBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      if (b && b.connected !== false) return b;
    } catch {}
    _browserPromise = null;
  }
  _browserPromise = (async () => {
    if (isServerlessEnv()) {
      // Producao Linux — usa o binario empacotado
      const executablePath = await chromium.executablePath();
      return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: true,
        ignoreHTTPSErrors: true,
      });
    }
    // Dev local — usa Chrome do sistema
    const localPath = resolveLocalChrome();
    if (!localPath) {
      throw new Error(
        'Chrome/Chromium nao encontrado. Instale o Google Chrome ou ' +
        'configure PUPPETEER_EXECUTABLE_PATH apontando pro executavel. ' +
        'Em prod Linux/Railway o @sparticuz/chromium e usado automaticamente.'
      );
    }
    console.log('[INFO][pdfRenderer] usando Chrome local', { path: localPath });
    return puppeteer.launch({
      executablePath: localPath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ignoreHTTPSErrors: true,
    });
  })();
  return _browserPromise;
}

async function closeBrowser() {
  if (!_browserPromise) return;
  try { const b = await _browserPromise; await b.close(); } catch {}
  _browserPromise = null;
}

/**
 * Renderiza HTML em PDF. Retorna Buffer.
 *
 * @param {string} html - Documento HTML completo (com <html>, <head>, <body>)
 * @param {object} [opts]
 * @param {string} [opts.format='A4']
 * @param {object} [opts.margin] - {top, right, bottom, left} em mm
 * @param {boolean} [opts.printBackground=true] - mantem cores/imagens (brandbook)
 * @param {boolean} [opts.includeFooter=true] - injeta "pag X de Y" no rodape
 * @returns {Promise<Buffer>}
 */
async function renderHtmlToPdf(html, opts = {}) {
  const {
    format = 'A4',
    margin = { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
    printBackground = true,
    includeFooter = true,
  } = opts;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // setContent espera todos os subresources (fontes inline, imagens) carregarem
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 30_000 });

    // Garante que @import de Google Fonts terminou de carregar
    try {
      await page.evaluate(() => document.fonts && document.fonts.ready);
    } catch {}

    const footerTemplate = includeFooter
      ? `<div style="font-size:8px;color:#666;font-family:monospace;width:100%;text-align:center;padding:0 18mm;">
           pagina <span class="pageNumber"></span> de <span class="totalPages"></span>
         </div>`
      : `<div></div>`;

    const pdfBuffer = await page.pdf({
      format,
      margin,
      printBackground,
      displayHeaderFooter: includeFooter,
      headerTemplate: '<div></div>',
      footerTemplate,
      preferCSSPageSize: false,
    });

    return pdfBuffer;
  } finally {
    try { await page.close(); } catch {}
  }
}

/**
 * Renderiza HTML para HTML otimizado pra preview em iframe.
 * Por enquanto e identico ao input — exposto pra simetria com o pipeline
 * de PDF (preview = HTML, download = PDF gerado a partir do mesmo HTML).
 */
function renderHtmlForPreview(html) {
  return html;
}

/**
 * Smoke test — usado pelo healthcheck pra validar que o Chromium roda.
 */
async function smokeTest() {
  const buf = await renderHtmlToPdf('<html><body><h1>OK</h1></body></html>', {
    includeFooter: false,
  });
  return { ok: true, sizeBytes: buf.length };
}

module.exports = {
  renderHtmlToPdf,
  renderHtmlForPreview,
  smokeTest,
  closeBrowser,
};
