/**
 * @fileoverview Web Scraper para extrair texto e metadados de URLs
 * @description Busca o conteúdo de uma URL e extrai o texto principal,
 * removendo HTML, scripts, styles e tags desnecessárias.
 * Suporta extração de OG tags, fallback para SPAs e content-type text/plain.
 * Usado para injetar conteúdo de referência nos prompts dos agentes.
 */

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Cria um timeout manual via Promise.race (substitui AbortSignal.timeout)
 * @param {number} ms - Timeout em milissegundos
 * @returns {{ signal: AbortSignal, clear: () => void }}
 */
function createTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Extrai OG tags e metadados do HTML bruto
 * @param {string} html - HTML completo da página
 * @returns {{ ogTitle: string, ogDesc: string, ogImage: string, siteName: string, description: string }}
 */
function extractMetadata(html) {
  const getMetaContent = (pattern) => {
    const match = html.match(pattern);
    return match ? match[1].trim() : '';
  };

  return {
    ogTitle:     getMetaContent(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
              || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i),
    ogDesc:      getMetaContent(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
              || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i),
    ogImage:     getMetaContent(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i),
    siteName:    getMetaContent(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
              || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i),
    description: getMetaContent(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
              || getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
  };
}

/**
 * Limpa HTML removendo tags desnecessárias e retorna texto limpo
 * @param {string} html - HTML bruto
 * @returns {string} Texto limpo
 */
function cleanHtml(html) {
  let text = html
    // Remove blocos inteiros de conteúdo irrelevante
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    // Remove elementos com role="navigation" e aria-hidden="true"
    .replace(/<[^>]+role=["']navigation["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .replace(/<[^>]+aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    // Remove comentários HTML
    .replace(/<!--[\s\S]*?-->/g, '');

  // Remove todas as tags HTML restantes
  text = text.replace(/<[^>]+>/g, ' ');

  // Decodifica entidades HTML comuns
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Limpa espaços excessivos
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return text;
}

// ─── Funções públicas ────────────────────────────────────────────────────────

/**
 * Busca o conteúdo textual de uma URL
 * @param {string} url - URL para buscar
 * @param {number} [maxChars=3000] - Limite de caracteres (economia de tokens)
 * @returns {Promise<{text: string, title: string, success: boolean, metadata: object}>}
 */
async function fetchUrlContent(url, maxChars = 3000) {
  const timeout = createTimeout(12000); // 12s timeout robusto

  try {
    console.log('[INFO][Scraper] Buscando conteúdo da URL', { url });

    const response = await Promise.race([
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SigmaBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,text/plain',
        },
        signal: timeout.signal,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de 12s excedido')), 12000)
      ),
    ]);

    timeout.clear();

    if (!response.ok) {
      console.warn('[WARNING][Scraper] URL retornou status', { url, status: response.status });
      return { text: '', title: '', success: false, metadata: {} };
    }

    const contentType = response.headers.get('content-type') || '';

    // Suporte a content-type text/plain — retorna direto sem parse HTML
    if (contentType.includes('text/plain')) {
      console.log('[INFO][Scraper] Content-type text/plain detectado', { url });
      let plainText = await response.text();
      if (plainText.length > maxChars) {
        plainText = plainText.substring(0, maxChars) + '... [conteúdo truncado]';
      }
      console.log('[SUCESSO][Scraper] Texto plano extraído', { url, textLength: plainText.length });
      return { text: plainText, title: '', success: true, metadata: {} };
    }

    const html = await response.text();

    // Extrai título
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extrai metadados OG
    const metadata = extractMetadata(html);

    // Limpa HTML e extrai texto
    let text = cleanHtml(html);

    // Fallback para SPAs: texto útil < 200 chars
    if (text.length < 200) {
      console.log('[WARNING][Scraper] SPA detectado, usando fallback de metadados', { url, textLength: text.length });
      const spaTitle = metadata.ogTitle || title || url;
      const spaDesc  = metadata.ogDesc || metadata.description || '';
      metadata.isSPA = true;
      text = `[SPA detectado - dados extraídos via metadados]\nTítulo: ${spaTitle}${spaDesc ? `\nDescrição: ${spaDesc}` : ''}`;

      console.log('[SUCESSO][Scraper] Metadados SPA extraídos', { url, title: spaTitle });
      return { text, title: spaTitle, success: true, metadata };
    }

    // Limita tamanho para economizar tokens
    if (text.length > maxChars) {
      text = text.substring(0, maxChars) + '... [conteúdo truncado]';
    }

    // Usa OG title como fallback do título
    const finalTitle = title || metadata.ogTitle || '';

    console.log('[SUCESSO][Scraper] Conteúdo extraído', { url, title: finalTitle, textLength: text.length });
    return { text, title: finalTitle, success: true, metadata };

  } catch (err) {
    timeout.clear();
    console.error('[ERRO][Scraper] Falha ao buscar URL', { url, error: err.message });
    return { text: '', title: '', success: false, metadata: {} };
  }
}

/**
 * Busca conteúdo de múltiplas URLs em paralelo
 * @param {string[]} urls
 * @param {number} [maxCharsPerUrl=2000]
 * @returns {Promise<string>} Texto formatado com conteúdo de todas as URLs
 */
async function fetchMultipleUrls(urls, maxCharsPerUrl = 2000) {
  if (!urls?.length) return '';

  const results = await Promise.all(
    urls.map(url => fetchUrlContent(url, maxCharsPerUrl))
  );

  const parts = [];
  results.forEach((r, i) => {
    if (r.success && r.text) {
      parts.push(`[Referência: ${r.title || urls[i]}]\n${r.text}`);
    }
  });

  return parts.join('\n\n---\n\n');
}

/**
 * Busca apenas título e metadados de uma URL (preview rápido de links)
 * @param {string} url - URL para buscar
 * @returns {Promise<{title: string, metadata: object, success: boolean}>}
 */
async function fetchUrlMetadata(url) {
  const timeout = createTimeout(8000); // 8s — mais rápido que full scrape

  try {
    console.log('[INFO][Scraper] Buscando metadados da URL', { url });

    const response = await Promise.race([
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SigmaBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: timeout.signal,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de 8s excedido')), 8000)
      ),
    ]);

    timeout.clear();

    if (!response.ok) {
      return { title: '', metadata: {}, success: false };
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const metadata = extractMetadata(html);
    const finalTitle = metadata.ogTitle || title || '';

    console.log('[SUCESSO][Scraper] Metadados extraídos', { url, title: finalTitle });
    return { title: finalTitle, metadata, success: true };

  } catch (err) {
    timeout.clear();
    console.error('[ERRO][Scraper] Falha ao buscar metadados', { url, error: err.message });
    return { title: '', metadata: {}, success: false };
  }
}

module.exports = { fetchUrlContent, fetchMultipleUrls, fetchUrlMetadata };
