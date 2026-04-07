/**
 * pages/api/onboarding/transcribe-audio.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/transcribe-audio
 * Body: multipart/form-data
 *   - audio:        File (webm/mp3/wav)
 *   - token:        string
 *   - stageNumber:  number
 *   - duration:     number (segundos)
 *
 * Pipeline:
 *   1. Valida token + limite diário (6 áudios/dia) + duração máxima (2 min)
 *   2. Carrega a config da etapa (perguntas)
 *   3. Envia o áudio pro Whisper (OpenAI)         → transcrição bruta
 *   4. Envia transcrição + perguntas pro GPT-4o   → JSON { questionId: resposta }
 *   5. Loga em onboarding_audio_usage e retorna pra UI
 *
 * Retorno:
 *   { success, transcription, parsedAnswers, usageRemaining }
 *
 * IMPORTANTE: precisamos desabilitar o body parser do Next pra ler multipart.
 * Usamos o formidable (já vem como dep transitiva do projeto via outros uploads)
 * — se não estiver instalado, fazemos parse manual via Web API formData.
 *
 * Aqui usei a Web API nativa do Next 14: req.formData() funciona nas
 * novas API Routes quando exportamos config.api.bodyParser = false E
 * usamos uma helper de stream pra montar o blob. Pra simplicidade e
 * compatibilidade com pages router, este endpoint usa o reader manual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProgressByToken,
  getStageConfig,
  getAudioUsageToday,
  logAudioUsage,
  AUDIO_DAILY_LIMIT,
  AUDIO_MAX_DURATION,
} from '../../../models/onboarding';

const { generateCompletion } = require('../../../infra/api/openai');

// Desabilita o body parser padrão — multipart precisa ser lido como stream
export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers de multipart parsing
   ─────────────────────────────────────────────────────────────────────────────
   Implementação manual minimalista — não usa formidable pra não adicionar dep.
   Lê o stream, identifica boundaries do multipart e extrai o arquivo + campos.
   Funciona para o cenário de UM arquivo + alguns campos texto, que é exatamente
   o que precisamos aqui.
   ───────────────────────────────────────────────────────────────────────────── */

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, contentType) {
  const match = contentType.match(/boundary=(.+)$/);
  if (!match) throw new Error('Content-Type sem boundary');
  const boundary = '--' + match[1];

  const parts = [];
  let start = 0;
  const boundaryBuf = Buffer.from(boundary);

  // Encontra todos os índices do boundary
  const indices = [];
  let idx = buffer.indexOf(boundaryBuf, 0);
  while (idx !== -1) {
    indices.push(idx);
    idx = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
  }

  // Cada par consecutivo de boundaries delimita uma "part"
  for (let i = 0; i < indices.length - 1; i++) {
    const partStart = indices[i] + boundaryBuf.length + 2; // pula \r\n após boundary
    const partEnd = indices[i + 1] - 2; // remove \r\n antes do próximo boundary
    const partBuf = buffer.slice(partStart, partEnd);
    parts.push(parsePart(partBuf));
  }

  return parts;
}

function parsePart(buffer) {
  // Headers separados do conteúdo por \r\n\r\n
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;

  const headerStr = buffer.slice(0, headerEnd).toString('utf8');
  const body = buffer.slice(headerEnd + 4);

  // Extrai content-disposition
  const dispositionMatch = headerStr.match(/Content-Disposition:.*?name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
  if (!dispositionMatch) return null;

  const name = dispositionMatch[1];
  const filename = dispositionMatch[2] || null;

  // Content-Type da part (se for arquivo)
  const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
  const contentType = ctMatch ? ctMatch[1].trim() : null;

  if (filename) {
    return { name, filename, contentType, data: body };
  } else {
    return { name, value: body.toString('utf8') };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Whisper API — transcrição de áudio
   ───────────────────────────────────────────────────────────────────────────── */

async function transcribeWithWhisper(audioBuffer, filename, mimeType) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada');

  console.log('[INFO][Whisper] iniciando transcrição', {
    bytes: audioBuffer.length,
    mimeType,
  });

  // O endpoint /audio/transcriptions usa multipart/form-data
  // Usamos a FormData global do Node 18+
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
  form.append('file', blob, filename || 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'pt'); // pt-BR — força português

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error('[ERRO][Whisper] falha', { status: response.status, body: errBody });
    throw new Error(`Whisper retornou ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  console.log('[SUCESSO][Whisper] transcrição recebida', {
    chars: data.text?.length || 0,
  });
  return data.text || '';
}

/* ─────────────────────────────────────────────────────────────────────────────
   Parser por GPT — mapeia transcrição → respostas das perguntas da etapa
   ─────────────────────────────────────────────────────────────────────────────
   Antes só lidava com text/textarea — agora suporta TODOS os tipos:
     · text/textarea  → string livre
     · select/radio   → string EXATAMENTE igual a uma das `options`
     · checkbox       → array de strings, cada uma uma `option` válida
     · slider/number  → número (0-10)
     · composite      → objeto { sub_field_id: valor }

   Estratégia:
     1. Manda pro GPT a lista de perguntas COM tipo e opções (quando aplicável)
     2. Pós-processa a resposta normalizando cada valor contra as options
        (matching case-insensitive + accents-insensitive + fuzzy básico)
   ───────────────────────────────────────────────────────────────────────────── */

/* Remove acentos + lowercase pra fazer matching tolerante */
function normalize(str) {
  return String(str || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/* Encontra a opção válida mais próxima de um valor solto.
 * Retorna a string exata da option válida ou null. */
function matchOption(value, options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (value === null || value === undefined) return null;

  const target = normalize(value);
  if (!target) return null;

  // 1. Match exato (após normalização)
  for (const opt of options) {
    if (normalize(opt) === target) return opt;
  }

  // 2. Match por substring (target está dentro da option ou vice-versa)
  for (const opt of options) {
    const optNorm = normalize(opt);
    if (optNorm.includes(target) || target.includes(optNorm)) return opt;
  }

  // 3. Sem match
  return null;
}

/* Normaliza o valor parseado contra a definição da pergunta */
function normalizeAnswerForQuestion(question, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const type = question.type;

  if (type === 'text' || type === 'textarea') {
    return typeof rawValue === 'string' ? rawValue : String(rawValue);
  }

  if (type === 'number' || type === 'slider') {
    const n = parseInt(rawValue, 10);
    if (isNaN(n)) return null;
    if (type === 'slider') return Math.max(0, Math.min(10, n));
    return n;
  }

  if (type === 'select' || type === 'radio') {
    // Pode vir como string OU como array de 1 elemento
    const candidate = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    return matchOption(candidate, question.options);
  }

  if (type === 'checkbox') {
    // Pode vir como array OU como string única OU string com vírgulas
    let items;
    if (Array.isArray(rawValue)) {
      items = rawValue;
    } else if (typeof rawValue === 'string') {
      // GPT às vezes retorna "Opção A, Opção B" — split por vírgula
      items = rawValue.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    } else {
      return null;
    }

    const matched = items
      .map(it => matchOption(it, question.options))
      .filter(Boolean);

    return matched.length > 0 ? Array.from(new Set(matched)) : null;
  }

  if (type === 'composite') {
    // Composite: o GPT retorna um objeto { subId: valor } OU
    // o caller já passou cada subcampo separado. Aqui só passa adiante
    // — o handler trata cada subcampo individualmente.
    return rawValue;
  }

  return rawValue;
}

async function parseAnswersWithGPT(transcription, questions) {
  const model = process.env.AI_MODEL_WEAK || 'gpt-4o-mini';

  /* Monta a lista de perguntas pro prompt incluindo tipo e opções.
   * O GPT precisa saber que pra um radio ele tem que retornar uma das
   * opções EXATAS, não inventar texto livre. */
  const questionLines = questions
    .filter(q => !q.id?.startsWith?.('_extra_'))
    .map(q => {
      let line = `[${q.id}] (${q.type}) ${q.label}`;
      if (q.options && q.options.length > 0) {
        line += `\n    Opções válidas: ${q.options.map(o => `"${o}"`).join(' | ')}`;
      }
      if (q.type === 'composite' && q.fields) {
        line += `\n    Subcampos: ${q.fields.map(f => `"${f.id}" (${f.label})`).join(', ')}`;
      }
      if (q.type === 'slider' || q.type === 'number') {
        line += `\n    (número de 0 a 10)`;
      }
      return line;
    })
    .join('\n\n');

  const systemPrompt = `Você é um assistente que transforma a transcrição de um áudio em respostas estruturadas para um questionário em português brasileiro.

CONTEXTO:
A pessoa gravou um áudio respondendo várias perguntas em sequência. Geralmente fala "a pergunta 1.1 é..., a 1.2 é..." ou simplesmente vai respondendo na ordem. Sua tarefa: identificar qual trecho responde qual pergunta E formatar de acordo com o TIPO da pergunta.

REGRAS DE FORMATO POR TIPO:

• text / textarea
  → Retorne uma string livre, limpa de "ah", "tipo", "né".

• select / radio
  → Retorne UMA string EXATAMENTE igual a uma das opções listadas.
  → Não invente nem traduza. Se a pessoa disse "menos de um ano" e a opção é "Menos de 1 ano", retorne "Menos de 1 ano".
  → Se nenhuma opção bate, OMITA essa pergunta da resposta.

• checkbox
  → Retorne um ARRAY de strings, cada uma EXATAMENTE igual a uma das opções.
  → Se a pessoa disse "WhatsApp e planilhas", retorne ["WhatsApp Business", "Planilhas (Excel/Sheets)"].
  → Se nada bate, omita.

• slider / number
  → Retorne um NÚMERO INTEIRO (não string).

• composite
  → Retorne um objeto { sub_id: "valor" } usando os IDs dos subcampos listados.

REGRAS GERAIS:
- Use os IDs exatos das perguntas (ex: "1.1", "3.5", "1.12_crm").
- NÃO inclua perguntas que não foram respondidas no áudio.
- Retorne EXCLUSIVAMENTE um JSON válido. Sem markdown, sem explicação, sem comentários.
- Em caso de dúvida, OMITA a pergunta — é melhor deixar vazio do que preencher errado.`;

  const userMessage = `LISTA DE PERGUNTAS:
${questionLines}

TRANSCRIÇÃO DO ÁUDIO:
"""
${transcription}
"""

Retorne o JSON.`;

  console.log('[INFO][GPT:parseAnswers] iniciando parsing', {
    model,
    transcriptionLength: transcription.length,
    questionCount: questions.length,
  });

  const { text } = await generateCompletion(model, systemPrompt, userMessage, 2000);

  // Tenta parsear o JSON. Tolerante a markdown ```json ... ```
  let parsed = {};
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[WARN][GPT:parseAnswers] não conseguiu parsear JSON', {
      raw: text.slice(0, 200),
    });
    parsed = {};
  }

  /* Pós-processamento: normaliza cada valor contra a definição da pergunta.
   * Garante que radio/select/checkbox sempre retornam valores válidos.
   * Composite é "explodido" em subcampos individuais. */
  const normalized = {};
  for (const q of questions) {
    if (q.id?.startsWith?.('_extra_')) continue;

    if (q.type === 'composite') {
      // Composite pode vir como objeto aninhado OU os subs já no nível raiz
      const compositeRaw = parsed[q.id];
      const fields = q.fields || [];

      for (const sub of fields) {
        // Tenta no objeto aninhado, depois no nível raiz
        const subValue = (compositeRaw && typeof compositeRaw === 'object' && compositeRaw[sub.id])
          || parsed[sub.id];
        if (subValue !== undefined && subValue !== null && subValue !== '') {
          normalized[sub.id] = String(subValue);
        }
      }
      continue;
    }

    const raw = parsed[q.id];
    if (raw === undefined || raw === null) continue;

    const value = normalizeAnswerForQuestion(q, raw);
    if (value !== null && value !== undefined && value !== '') {
      normalized[q.id] = value;
    }
  }

  console.log('[SUCESSO][GPT:parseAnswers] parsing concluído', {
    keysRaw: Object.keys(parsed).length,
    keysNormalized: Object.keys(normalized).length,
  });
  return normalized;
}

/* ─────────────────────────────────────────────────────────────────────────────
   HANDLER PRINCIPAL
   ───────────────────────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    // 1. Lê o body multipart
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ success: false, error: 'Content-Type deve ser multipart/form-data' });
    }

    const buffer = await readBody(req);
    const parts = parseMultipart(buffer, contentType);

    // 2. Extrai os campos
    const fields = {};
    let audioPart = null;
    for (const p of parts) {
      if (!p) continue;
      if (p.filename) audioPart = p;
      else fields[p.name] = p.value;
    }

    const { token, stageNumber, duration } = fields;
    const stageNum = parseInt(stageNumber, 10);
    const durationSec = parseInt(duration, 10) || 0;

    if (!token || !stageNum) {
      return res.status(400).json({ success: false, error: 'Faltam token ou stageNumber' });
    }
    if (!audioPart) {
      return res.status(400).json({ success: false, error: 'Arquivo de áudio não enviado' });
    }
    if (durationSec > AUDIO_MAX_DURATION) {
      return res.status(400).json({
        success: false,
        error: `Áudio máximo de ${AUDIO_MAX_DURATION} segundos.`,
      });
    }

    // 3. Valida o token e checa limite diário
    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Token inválido' });
    }

    const used = await getAudioUsageToday(progress.client_id);
    if (used >= AUDIO_DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        error: `Limite diário de ${AUDIO_DAILY_LIMIT} áudios atingido. Tenta amanhã.`,
        usageRemaining: 0,
      });
    }

    // 4. Carrega as perguntas da etapa
    const stageConfig = await getStageConfig(progress.tenant_id, stageNum);
    if (!stageConfig) {
      return res.status(404).json({ success: false, error: 'Etapa não encontrada' });
    }
    const questions = stageConfig.questions_json || [];

    // 5. Whisper → transcrição
    const transcription = await transcribeWithWhisper(
      audioPart.data,
      audioPart.filename,
      audioPart.contentType
    );

    if (!transcription || transcription.trim().length < 5) {
      return res.json({
        success: false,
        error: 'Áudio muito curto ou sem fala detectada.',
        transcription,
      });
    }

    // 6. GPT → mapeia em respostas estruturadas
    const parsedAnswers = await parseAnswersWithGPT(transcription, questions);

    // 7. Loga o uso
    await logAudioUsage(progress.client_id, stageNum, durationSec, transcription, parsedAnswers);

    return res.json({
      success: true,
      transcription,
      parsedAnswers,
      usageRemaining: AUDIO_DAILY_LIMIT - used - 1,
    });

  } catch (err) {
    console.error('[ERRO][API:onboarding/transcribe-audio]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
