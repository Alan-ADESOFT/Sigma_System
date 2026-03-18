/**
 * @fileoverview Web Scraper simples para extrair texto de URLs
 * @description Busca o conteúdo de uma URL e extrai o texto principal,
 * removendo HTML, scripts, styles e tags desnecessárias.
 * Usado para injetar conteúdo de referência nos prompts dos agentes.
 */

/**
 * Busca o conteúdo textual de uma URL
 * @param {string} url - URL para buscar
 * @param {number} [maxChars=3000] - Limite de caracteres (economia de tokens)
 * @returns {Promise<{text: string, title: string, success: boolean}>}
 */
async function fetchUrlContent(url, maxChars = 3000) {
  try {
    console.log('[INFO][Scraper] Buscando conteúdo da URL', { url });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SigmaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      console.warn('[WARNING][Scraper] URL retornou status', { url, status: response.status });
      return { text: '', title: '', success: false };
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // Extrai título
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Remove scripts, styles, noscript, SVGs
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');

    // Remove todas as tags HTML
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

    // Limita tamanho para economizar tokens
    if (text.length > maxChars) {
      text = text.substring(0, maxChars) + '... [conteúdo truncado]';
    }

    console.log('[SUCESSO][Scraper] Conteúdo extraído', { url, title, textLength: text.length });
    return { text, title, success: true };

  } catch (err) {
    console.error('[ERRO][Scraper] Falha ao buscar URL', { url, error: err.message });
    return { text: '', title: '', success: false };
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

module.exports = { fetchUrlContent, fetchMultipleUrls };
