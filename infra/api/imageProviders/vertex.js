/**
 * @fileoverview Provider Imagen 4 via Google Vertex AI REST
 * @description Implementação sem o SDK 'googleapis' — fazemos JWT signing
 * manual com `crypto` nativo para trocar service account JSON por access token.
 *
 * Endpoint:
 *   https://{location}-aiplatform.googleapis.com/v1/projects/{project}/
 *   locations/{location}/publishers/google/models/imagen-4.0-generate-001:predict
 *
 * Cache:
 *   · credentials JSON é parseado apenas quando a string muda (module-scope)
 *   · access token é cached por 50 min (Google emite com TTL de 60 min)
 */

const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min

// ── Caches module-scope ─────────────────────────────────────────────────────
let _credCache = { raw: null, parsed: null };
let _tokenCache = { credHash: null, token: null, expiresAt: 0 };

// ── Helpers internos ────────────────────────────────────────────────────────

/**
 * Parseia (e cacheia) o JSON da service account.
 * Re-parsea só quando a string raw muda.
 */
function parseCredentials(rawJson) {
  if (!rawJson) {
    const err = new Error('Vertex: credentials JSON ausente');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (_credCache.raw === rawJson && _credCache.parsed) {
    return _credCache.parsed;
  }
  let parsed;
  try {
    parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  } catch (err) {
    const e = new Error('Vertex: credentials JSON inválido');
    e.code = 'INVALID_INPUT';
    throw e;
  }
  if (!parsed.client_email || !parsed.private_key) {
    const e = new Error('Vertex: credentials precisa ter client_email e private_key');
    e.code = 'INVALID_INPUT';
    throw e;
  }
  _credCache = { raw: rawJson, parsed };
  return parsed;
}

/**
 * Codifica em base64url (sem padding) — formato exigido pelo JWT.
 */
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Assina o JWT com RS256 usando crypto nativo.
 */
function signJwt(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Hash determinístico das credenciais para chave de cache do token.
 */
function hashCred(parsed) {
  return crypto.createHash('sha256')
    .update(parsed.client_email + ':' + parsed.private_key_id)
    .digest('hex');
}

/**
 * Troca service account por access token OAuth2 (cache 50min).
 *
 * @param {string|object} credentials - JSON da service account
 * @returns {Promise<string>} access_token
 */
async function getVertexAccessToken(credentials) {
  const parsed = parseCredentials(credentials);
  const credHash = hashCred(parsed);

  if (_tokenCache.credHash === credHash &&
      _tokenCache.token &&
      Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(
    {
      iss: parsed.client_email,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    },
    parsed.private_key
  );

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
    const err = new Error(`Vertex auth falhou (${resp.status}): ${txt}`);
    err.code = 'PROVIDER_ERROR';
    throw err;
  }
  const data = await resp.json();
  _tokenCache = {
    credHash,
    token: data.access_token,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  return data.access_token;
}

/**
 * Mapeia aspect ratio do projeto → formato aceito pelo Imagen.
 * Imagen aceita: '1:1', '9:16', '16:9', '3:4', '4:3'.
 */
function mapAspectRatio(ratio) {
  const allowed = ['1:1', '9:16', '16:9', '3:4', '4:3'];
  if (allowed.includes(ratio)) return ratio;
  // Fallbacks conhecidos
  if (ratio === '4:5') return '3:4';
  if (ratio === '3:2') return '4:3';
  return '1:1';
}

// ── API do provider ─────────────────────────────────────────────────────────

/**
 * Gera imagem via Imagen 4.
 * @param {object} params - vide imageProviders/index.js#GenerateImageParams
 * @returns {Promise<{imageBuffer: Buffer, mimeType: string, metadata: object}>}
 */
async function generate(params) {
  const { model, prompt, negativePrompt, aspectRatio, settings } = params;

  if (!settings?.vertex_credentials_decrypted) {
    const err = new Error('Vertex: credentials não configuradas para este tenant');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const projectId = settings.vertex_project_id || process.env.GOOGLE_VERTEX_PROJECT_ID;
  const location = settings.vertex_location || process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
  if (!projectId) {
    const err = new Error('Vertex: project_id não configurado');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const accessToken = await getVertexAccessToken(settings.vertex_credentials_decrypted);

  // Mapeia model ID amigável → publisher model ID do Vertex
  const modelMap = {
    'imagen-4':              'imagen-4.0-generate-001',
    'imagen-4-fast':         'imagen-4.0-fast-generate-001',
    'imagen-3':              'imagegeneration@006',
  };
  const publisherModel = modelMap[model] || model;

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
              `/locations/${location}/publishers/google/models/${publisherModel}:predict`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: mapAspectRatio(aspectRatio || '1:1'),
      safetyFilterLevel: 'block_some',
      personGeneration: 'allow_adult',
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`Vertex predict falhou (${resp.status}): ${txt.slice(0, 500)}`);
    if (resp.status === 429) err.code = 'RATE_LIMITED';
    else if (resp.status === 400 && /safety|block|content/i.test(txt)) err.code = 'CONTENT_BLOCKED';
    else err.code = 'PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const pred = data.predictions?.[0];
  if (!pred) {
    const err = new Error('Vertex: resposta sem prediction (provavelmente bloqueio de conteúdo)');
    err.code = 'CONTENT_BLOCKED';
    throw err;
  }
  if (!pred.bytesBase64Encoded) {
    const err = new Error('Vertex: prediction sem bytesBase64Encoded');
    err.code = 'PROVIDER_ERROR';
    throw err;
  }

  return {
    imageBuffer: Buffer.from(pred.bytesBase64Encoded, 'base64'),
    mimeType: pred.mimeType || 'image/png',
    metadata: {
      provider: 'vertex',
      model: publisherModel,
      aspect_ratio: body.parameters.aspectRatio,
      safety_filter_level: body.parameters.safetyFilterLevel,
      raw_safety: pred.safetyAttributes || null,
    },
  };
}

/**
 * Testa credenciais sem custo: tenta apenas obter access token.
 * @param {string} _apiKey - Não usado (Vertex usa JSON, vem em `extra`)
 * @param {object} extra - { credentials: string|object }
 */
async function testKey(_apiKey, extra = {}) {
  const cred = extra.credentials || _apiKey; // aceita JSON em qualquer um
  await getVertexAccessToken(cred);
  return true;
}

module.exports = { generate, testKey, getVertexAccessToken };
