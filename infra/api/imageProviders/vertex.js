/**
 * @fileoverview Provider Vertex AI — Imagen 3 Capability + Imagen 4
 * @description JWT signing manual (sem SDK googleapis) pra trocar service
 * account JSON por access token. Cache do JSON parseado e do token (50min).
 *
 * Sprint v1.1 — abril 2026:
 *   · Imagen 4 (imagen-4.0-generate-001): TEXT-TO-IMAGE puro, NÃO aceita refs
 *   · Imagen 3 Capability (imagen-3.0-capability-001): aceita até 4 reference
 *     images com tipos REFERENCE_TYPE_SUBJECT (PERSON/PRODUCT/ANIMAL),
 *     REFERENCE_TYPE_STYLE, REFERENCE_TYPE_CONTROL
 *   · Imagen 3 Capability será descontinuado em 24/Jun/2026 — quando der
 *     erro de "model not enabled / deprecated", retorna MODEL_UNAVAILABLE
 *     pra UI desabilitar sem quebrar o fluxo
 */

const crypto = require('crypto');
const { loadInternalUpload, err, mapHttpStatus } = require('./_helpers');

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_MS = 50 * 60 * 1000;

let _credCache = { raw: null, parsed: null };
let _tokenCache = { credHash: null, token: null, expiresAt: 0 };

function parseCredentials(rawJson) {
  if (!rawJson) throw err('INVALID_INPUT', 'Vertex: credentials JSON ausente');
  if (_credCache.raw === rawJson && _credCache.parsed) return _credCache.parsed;
  let parsed;
  try {
    parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  } catch {
    throw err('INVALID_INPUT', 'Vertex: credentials JSON inválido');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw err('INVALID_INPUT', 'Vertex: credentials precisa ter client_email e private_key');
  }
  _credCache = { raw: rawJson, parsed };
  return parsed;
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64url(signer.sign(privateKeyPem))}`;
}

function hashCred(parsed) {
  return crypto.createHash('sha256')
    .update(parsed.client_email + ':' + parsed.private_key_id)
    .digest('hex');
}

async function getVertexAccessToken(credentials) {
  const parsed = parseCredentials(credentials);
  const credHash = hashCred(parsed);

  if (_tokenCache.credHash === credHash && _tokenCache.token && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt({
    iss: parsed.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }, parsed.private_key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw err('AUTHENTICATION_FAILED', `Vertex auth falhou (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  _tokenCache = {
    credHash,
    token: data.access_token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  return data.access_token;
}

function mapAspectVertex(ratio) {
  const allowed = ['1:1', '9:16', '16:9', '3:4', '4:3'];
  if (allowed.includes(ratio)) return ratio;
  if (ratio === '4:5') return '3:4';
  if (ratio === '3:2') return '4:3';
  return '1:1';
}

/**
 * Resolve publisher model ID a partir do model amigável.
 */
function resolveModelId(model) {
  const map = {
    // Lineup v1.1 (publisher IDs já são os finais)
    'imagen-3.0-capability-001':    'imagen-3.0-capability-001',
    'imagen-4.0-generate-001':      'imagen-4.0-generate-001',
    'imagen-4.0-fast-generate-001': 'imagen-4.0-fast-generate-001',
    // Compat reversa
    'imagen-4':       'imagen-4.0-generate-001',
    'imagen-4-fast':  'imagen-4.0-fast-generate-001',
    'imagen-3':       'imagegeneration@006',
  };
  return map[model] || model;
}

/**
 * Imagen 3 Capability — aceita reference images tipadas.
 *
 * REGRAS críticas (causam INVALID_ARGUMENT se violadas):
 *   1. Prompt DEVE conter markers [1], [2] ... referenciando os referenceIds
 *      enviados em referenceImages. Sem isso → 400 INVALID_ARGUMENT.
 *   2. STYLE references: aceita só 1 imagem (múltiplas confundem a API).
 *   3. SUBJECT: até 4, mas precisam de subjectImageConfig completo.
 *
 * Esta função normaliza tudo isso antes de chamar a API.
 */
async function generateCapability(params) {
  const { prompt, imageInputs, settings, signal, aspectRatio } = params;

  if (!settings?.vertex_credentials_decrypted) {
    throw err('AUTHENTICATION_FAILED', 'Vertex: credentials não configuradas');
  }
  const projectId = settings.vertex_project_id || process.env.GOOGLE_VERTEX_PROJECT_ID;
  const location = settings.vertex_location || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  if (!projectId) throw err('INVALID_INPUT', 'Vertex: project_id não configurado');

  const accessToken = await getVertexAccessToken(settings.vertex_credentials_decrypted);

  // ── Normalização das refs ─────────────────────────────────────────────
  // Separa por tipo. STYLE limita a 1 (a API não aceita múltiplas STYLE).
  // SUBJECT até 4. Nenhum exceder 4 total.
  const refsTyped = [];
  let styleAdded = false;
  let nextRefId = 1;
  for (const img of (imageInputs || [])) {
    if (refsTyped.length >= 4) break;
    const buffer = img.buffer || await loadInternalUpload(img.url);
    if (!buffer) continue;
    const base64 = buffer.toString('base64');

    if (img.role === 'character') {
      refsTyped.push({
        referenceType: 'REFERENCE_TYPE_SUBJECT',
        referenceId: nextRefId++,
        referenceImage: { bytesBase64Encoded: base64 },
        subjectImageConfig: {
          subjectDescription: img.description || 'main subject',
          subjectType: img.subjectType || 'SUBJECT_TYPE_PERSON',
        },
      });
    } else {
      // 'scene' ou 'inspiration' viram STYLE — mas limita a 1
      if (styleAdded) continue;
      styleAdded = true;
      refsTyped.push({
        referenceType: 'REFERENCE_TYPE_STYLE',
        referenceId: nextRefId++,
        referenceImage: { bytesBase64Encoded: base64 },
      });
    }
  }

  // ── Garante markers no prompt ─────────────────────────────────────────
  // Imagen 3 Capability EXIGE [1], [2]... no prompt referenciando refs.
  // Se o LLM esqueceu, prepend a instrução.
  let finalPrompt = prompt || '';
  if (refsTyped.length > 0) {
    const hasAnyMarker = refsTyped.some(r => finalPrompt.includes(`[${r.referenceId}]`));
    if (!hasAnyMarker) {
      const subjectRefs = refsTyped.filter(r => r.referenceType === 'REFERENCE_TYPE_SUBJECT');
      const styleRefs   = refsTyped.filter(r => r.referenceType === 'REFERENCE_TYPE_STYLE');
      const intro = [];
      if (subjectRefs.length) {
        intro.push('Featuring ' + subjectRefs.map(r => `subject [${r.referenceId}]`).join(' and '));
      }
      if (styleRefs.length) {
        intro.push('in the style of reference [' + styleRefs[0].referenceId + ']');
      }
      finalPrompt = `${intro.join(', ')}. ${finalPrompt}`;
      console.log('[INFO][Vertex Capability] markers ausentes — prepended automaticamente');
    }
  }

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
              `/locations/${location}/publishers/google/models/imagen-3.0-capability-001:predict`;

  const body = {
    instances: [{
      prompt: finalPrompt,
      ...(refsTyped.length ? { referenceImages: refsTyped } : {}),
    }],
    parameters: {
      sampleCount: 1,
      aspectRatio: mapAspectVertex(aspectRatio || '1:1'),
      personGeneration: 'allow_adult',
      safetySetting: 'block_medium_and_above',
    },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'Vertex: timeout');
    throw err('PROVIDER_UNAVAILABLE', `Vertex: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    // Logging detalhado pra diagnóstico do INVALID_ARGUMENT genérico do Vertex.
    // Imagen 3 Capability é particularmente picky — esse log mostra exatamente
    // o que foi enviado vs o que a API retornou.
    console.error('[ERRO][Vertex Capability] response not ok', {
      status: resp.status,
      statusText: resp.statusText,
      responseBody: txt.slice(0, 1000),
      sentPayload: {
        promptStart: finalPrompt.slice(0, 200),
        refsCount: refsTyped.length,
        refsTypes: refsTyped.map(r => ({
          type: r.referenceType,
          id: r.referenceId,
          subjectType: r.subjectImageConfig?.subjectType,
        })),
        aspectRatio: body.parameters.aspectRatio,
        personGeneration: body.parameters.personGeneration,
      },
    });

    // Modelo deprecated ou não habilitado no projeto GCP
    if (resp.status === 404 || /not enabled|deprecated|not found|permission denied/i.test(txt)) {
      const e = new Error(
        'Imagen 3 Capability não está habilitado no seu projeto GCP. ' +
        'Vá em Console GCP → Vertex AI → Model Garden → "imagen-3.0-capability-001" → Enable. ' +
        'Aviso: este modelo será descontinuado em 24/Jun/2026 — recomendamos usar Flux Kontext Pro ou Nano Banana 2.'
      );
      e.code = 'MODEL_UNAVAILABLE';
      e.modelId = 'imagen-3.0-capability-001';
      throw e;
    }
    // INVALID_ARGUMENT com refs → fallback graceful: tenta sem refs
    if (resp.status === 400 && refsTyped.length > 0) {
      console.warn('[WARN][Vertex Capability] 400 com refs — tentando text-only fallback');
      const fallbackBody = {
        instances: [{ prompt: finalPrompt }],
        parameters: body.parameters,
      };
      const fbResp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackBody),
        signal,
      });
      if (fbResp.ok) {
        const fbData = await fbResp.json();
        const fbPred = fbData.predictions?.[0];
        if (fbPred?.bytesBase64Encoded) {
          console.log('[INFO][Vertex Capability] fallback text-only funcionou');
          return {
            imageBuffer: Buffer.from(fbPred.bytesBase64Encoded, 'base64'),
            mimeType: fbPred.mimeType || 'image/png',
            metadata: {
              provider: 'vertex',
              model: 'imagen-3.0-capability-001',
              aspect_ratio: body.parameters.aspectRatio,
              refsUsed: 0,
              fallback: 'text-only (refs rejeitadas pela API)',
            },
          };
        }
      } else {
        const fbTxt = await fbResp.text().catch(() => '');
        console.warn('[WARN][Vertex Capability] fallback text-only também falhou', {
          status: fbResp.status, body: fbTxt.slice(0, 400),
        });
      }
    }
    const code = mapHttpStatus(resp.status, txt);
    throw err(code,
      `Vertex Capability ${resp.status}: ${txt.slice(0, 300)}\n\n` +
      `Diagnóstico provável:\n` +
      `1. Modelo "imagen-3.0-capability-001" pode não estar habilitado no seu projeto GCP.\n` +
      `2. Sua region (${location}) pode não suportar esse modelo. Tente "us-central1".\n` +
      `3. Recomendamos usar Flux Kontext Pro ou Nano Banana 2 — fazem o mesmo e são mais estáveis.`
    );
  }

  const data = await resp.json();
  const pred = data.predictions?.[0];
  if (!pred) throw err('CONTENT_BLOCKED', 'Vertex: resposta sem prediction (provavelmente bloqueio)');
  if (!pred.bytesBase64Encoded) throw err('PROVIDER_ERROR', 'Vertex: prediction sem bytesBase64Encoded');

  return {
    imageBuffer: Buffer.from(pred.bytesBase64Encoded, 'base64'),
    mimeType: pred.mimeType || 'image/png',
    metadata: {
      provider: 'vertex',
      model: 'imagen-3.0-capability-001',
      aspect_ratio: body.parameters.aspectRatio,
      refsUsed: refsTyped.length,
      raw_safety: pred.safetyAttributes || null,
    },
  };
}

/**
 * Imagen 4 (puro text-to-image — não aceita refs). Mantido pra compat com
 * publisher IDs antigos (imagen-4-fast, imagen-3 legado).
 */
async function generateText2Image(params) {
  const { model, prompt, negativePrompt, aspectRatio, settings, signal, imageInputs } = params;

  if (!settings?.vertex_credentials_decrypted) {
    throw err('AUTHENTICATION_FAILED', 'Vertex: credentials não configuradas');
  }

  // Imagen 4 NÃO aceita refs. Loga warning se vierem (o worker já deveria
  // ter desviado, mas defesa em profundidade).
  if (Array.isArray(imageInputs) && imageInputs.length > 0) {
    console.warn('[WARN][Vertex] Imagen 4 não aceita reference images — ignorando', {
      model, refsCount: imageInputs.length,
    });
  }

  const projectId = settings.vertex_project_id || process.env.GOOGLE_VERTEX_PROJECT_ID;
  const location = settings.vertex_location || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  if (!projectId) throw err('INVALID_INPUT', 'Vertex: project_id não configurado');

  const accessToken = await getVertexAccessToken(settings.vertex_credentials_decrypted);
  const publisherModel = resolveModelId(model);

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
              `/locations/${location}/publishers/google/models/${publisherModel}:predict`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: mapAspectVertex(aspectRatio || '1:1'),
      safetyFilterLevel: 'block_some',
      personGeneration: 'allow_adult',
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'Vertex: timeout');
    throw err('PROVIDER_UNAVAILABLE', `Vertex: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    if (resp.status === 404 || /not enabled|deprecated/i.test(txt)) {
      const e = new Error('Modelo não disponível');
      e.code = 'MODEL_UNAVAILABLE';
      e.modelId = publisherModel;
      throw e;
    }
    const code = mapHttpStatus(resp.status, txt);
    throw err(code, `Vertex Imagen: ${resp.status} ${txt.slice(0, 400)}`);
  }

  const data = await resp.json();
  const pred = data.predictions?.[0];
  if (!pred) throw err('CONTENT_BLOCKED', 'Vertex: resposta sem prediction (provavelmente bloqueio)');
  if (!pred.bytesBase64Encoded) throw err('PROVIDER_ERROR', 'Vertex: prediction sem bytesBase64Encoded');

  return {
    imageBuffer: Buffer.from(pred.bytesBase64Encoded, 'base64'),
    mimeType: pred.mimeType || 'image/png',
    metadata: {
      provider: 'vertex',
      model: publisherModel,
      aspect_ratio: body.parameters.aspectRatio,
      raw_safety: pred.safetyAttributes || null,
    },
  };
}

/**
 * Roteamento por model ID.
 */
async function generate(params) {
  const { model } = params;
  const resolved = resolveModelId(model);
  if (resolved === 'imagen-3.0-capability-001') {
    return generateCapability(params);
  }
  return generateText2Image(params);
}

async function testKey(_apiKey, extra = {}) {
  const cred = extra.credentials || _apiKey;
  await getVertexAccessToken(cred);
  return true;
}

module.exports = { generate, testKey, getVertexAccessToken };
