/**
 * @fileoverview Extração de texto de arquivos PDF e DOCX
 * @description Extrai texto limpo de arquivos para uso nos agentes.
 * Estratégia: extração local via libraries (sem enviar para API externa),
 * com detecção de PDFs escaneados (OCR completo fica para iteração futura).
 *
 * Dependências:
 *   npm install pdf-parse mammoth
 *
 * pdf-parse: extrai texto de PDFs nativos (texto selecionável)
 * mammoth:   extrai texto de DOCX preservando estrutura básica
 *
 * Variáveis necessárias no .env:
 *   AI_FILE_MAX_SIZE_BYTES — limite de tamanho em bytes (padrão: 20MB)
 */

const MAX_TEXT_CHARS = 8000; // Limite de texto extraído (economia de tokens)

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Valida tamanho do buffer contra o limite configurado
 * @param {Buffer} buffer
 * @param {string} fileName
 */
function validateFileSize(buffer, fileName = '') {
  const maxSize = parseInt(process.env.AI_FILE_MAX_SIZE_BYTES) || 20971520; // 20MB
  if (buffer.length > maxSize) {
    throw new Error(
      `Arquivo ${fileName ? `"${fileName}" ` : ''}excede o limite de ${Math.round(maxSize / 1024 / 1024)}MB. ` +
      `Tamanho: ${(buffer.length / 1024 / 1024).toFixed(1)}MB.`
    );
  }
}

/**
 * Trunca texto ao limite de caracteres
 * @param {string} text
 * @returns {string}
 */
function truncateText(text) {
  if (text.length > MAX_TEXT_CHARS) {
    return text.substring(0, MAX_TEXT_CHARS) + '\n... [conteúdo truncado em 8000 caracteres]';
  }
  return text;
}

/**
 * Conta palavras de um texto
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// ─── Funções públicas ────────────────────────────────────────────────────────

/**
 * Extrai texto de um arquivo PDF
 * @param {Buffer} buffer - Buffer do arquivo PDF
 * @param {{ fileName?: string }} [options={}]
 * @returns {Promise<{ text: string, pageCount: number, wordCount: number, success: boolean, reason?: string, fileName?: string }>}
 */
async function extractFromPDF(buffer, options = {}) {
  const fileName = options.fileName || '';

  try {
    let pdfParse;
    try {
      pdfParse = require('pdf-parse');
    } catch {
      console.error('[ERRO][FileReader] pdf-parse não instalado');
      return {
        text: '', pageCount: 0, wordCount: 0, success: false, fileName,
        reason: 'Dependência pdf-parse não encontrada. Execute: npm install pdf-parse',
      };
    }

    console.log('[INFO][FileReader] Extraindo texto de PDF', { fileName, sizeKB: Math.round(buffer.length / 1024) });
    validateFileSize(buffer, fileName);

    const data = await pdfParse(buffer);
    let text = (data.text || '').trim();

    // PDF escaneado/imagem: texto extraído muito curto
    if (text.length < 100) {
      console.warn('[WARNING][FileReader] PDF aparenta ser escaneado, tentando Vision...', { fileName, textLength: text.length });
      return {
        text: '', pageCount: data.numpages || 0, wordCount: 0,
        success: false, fileName,
        reason: 'scanned_pdf',
      };
    }

    text = truncateText(text);
    const wordCount = countWords(text);

    console.log('[SUCESSO][FileReader] PDF extraído', { fileName, pages: data.numpages, wordCount, textLength: text.length });
    return {
      text, pageCount: data.numpages || 0, wordCount,
      success: true, fileName,
    };

  } catch (err) {
    console.error('[ERRO][FileReader] Falha ao extrair PDF', { fileName, error: err.message });
    return {
      text: '', pageCount: 0, wordCount: 0,
      success: false, fileName,
      reason: err.message,
    };
  }
}

/**
 * Extrai texto de um arquivo DOCX
 * @param {Buffer} buffer - Buffer do arquivo DOCX
 * @param {{ fileName?: string }} [options={}]
 * @returns {Promise<{ text: string, wordCount: number, success: boolean, reason?: string, fileName?: string }>}
 */
async function extractFromDOCX(buffer, options = {}) {
  const fileName = options.fileName || '';

  try {
    let mammoth;
    try {
      mammoth = require('mammoth');
    } catch {
      console.error('[ERRO][FileReader] mammoth não instalado');
      return {
        text: '', wordCount: 0, success: false, fileName,
        reason: 'Dependência mammoth não encontrada. Execute: npm install mammoth',
      };
    }

    console.log('[INFO][FileReader] Extraindo texto de DOCX', { fileName, sizeKB: Math.round(buffer.length / 1024) });
    validateFileSize(buffer, fileName);

    const result = await mammoth.extractRawText({ buffer });
    let text = (result.value || '').trim();

    if (!text) {
      console.warn('[WARNING][FileReader] DOCX vazio ou sem texto', { fileName });
      return {
        text: '', wordCount: 0, success: false, fileName,
        reason: 'Arquivo DOCX vazio ou sem texto extraível',
      };
    }

    text = truncateText(text);
    const wordCount = countWords(text);

    console.log('[SUCESSO][FileReader] DOCX extraído', { fileName, wordCount, textLength: text.length });
    return { text, wordCount, success: true, fileName };

  } catch (err) {
    console.error('[ERRO][FileReader] Falha ao extrair DOCX', { fileName, error: err.message });
    return {
      text: '', wordCount: 0, success: false, fileName,
      reason: err.message,
    };
  }
}

/**
 * Router: detecta o tipo do arquivo e chama a função de extração correta
 * @param {Buffer} buffer - Buffer do arquivo
 * @param {string} mimeType - MIME type do arquivo
 * @param {string} [fileName=''] - Nome do arquivo (para logs)
 * @returns {Promise<{ text: string, success: boolean, reason?: string, wordCount?: number, pageCount?: number, fileName?: string }>}
 */
async function extractFromFile(buffer, mimeType, fileName = '') {
  console.log('[INFO][FileReader] Processando arquivo', { fileName, mimeType, sizeKB: Math.round(buffer.length / 1024) });

  try {
    switch (mimeType) {
      case 'application/pdf':
        return extractFromPDF(buffer, { fileName });

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return extractFromDOCX(buffer, { fileName });

      case 'text/plain': {
        let text = buffer.toString('utf-8').trim();
        text = truncateText(text);
        const wordCount = countWords(text);
        console.log('[SUCESSO][FileReader] Texto plano extraído', { fileName, wordCount });
        return { text, success: true, wordCount, fileName };
      }

      default:
        console.warn('[WARNING][FileReader] Tipo não suportado', { fileName, mimeType });
        return {
          text: '', success: false, fileName,
          reason: `Tipo de arquivo não suportado: ${mimeType}. Aceitos: PDF, DOCX, DOC, TXT.`,
        };
    }
  } catch (err) {
    console.error('[ERRO][FileReader] Falha no processamento', { fileName, mimeType, error: err.message });
    return {
      text: '', success: false, fileName,
      reason: err.message,
    };
  }
}

module.exports = { extractFromPDF, extractFromDOCX, extractFromFile };
