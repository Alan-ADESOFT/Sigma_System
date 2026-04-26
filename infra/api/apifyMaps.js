/**
 * @fileoverview Wrapper Apify Google Maps Scraper
 * @description Usado pelo módulo comercial para captar leads do Google Maps.
 * Usa fetch nativo (zero deps). Multi-step: startRun → poll status → fetch results.
 *
 * Endpoints da Apify:
 *   POST  https://api.apify.com/v2/acts/{ACTOR_ID}/runs?token={APIFY_TOKEN}
 *   GET   https://api.apify.com/v2/actor-runs/{RUN_ID}?token={APIFY_TOKEN}
 *   GET   https://api.apify.com/v2/datasets/{DATASET_ID}/items?token={APIFY_TOKEN}
 *
 * Env:
 *   APIFY_TOKEN              (obrigatório)
 *   APIFY_GOOGLE_MAPS_ACTOR  (default: compass~crawler-google-places)
 */

const API_BASE = 'https://api.apify.com/v2';

// ─── Config ──────────────────────────────────────────────────────────────────

function assertConfig() {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN não configurado no .env');
  }
}

function getActorId() {
  return process.env.APIFY_GOOGLE_MAPS_ACTOR || 'compass~crawler-google-places';
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function apifyFetch(path, options = {}) {
  assertConfig();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${sep}token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await res.text();
  if (!res.ok) {
    const snippet = body ? body.slice(0, 300) : '(sem corpo)';
    throw new Error(`Apify retornou erro: ${res.status} - ${snippet}`);
  }

  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return body;
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Inicia uma run do actor de Google Maps.
 * @param {Object} input - Input do actor (searchStringsArray, locationQuery, ...)
 * @returns {Promise<{ runId: string, datasetId: string, status: string }>}
 */
async function startRun(input) {
  console.log('[INFO][infra/apifyMaps:startRun]', { actor: getActorId() });

  const actor = encodeURIComponent(getActorId());
  const json = await apifyFetch(`/acts/${actor}/runs`, {
    method: 'POST',
    body: JSON.stringify(input || {}),
  });

  const data = json?.data || {};
  if (!data.id) {
    throw new Error('Apify não retornou ID da run');
  }

  console.log('[SUCESSO][infra/apifyMaps:startRun]', { runId: data.id, datasetId: data.defaultDatasetId });
  return {
    runId: data.id,
    datasetId: data.defaultDatasetId,
    status: data.status,
  };
}

/**
 * Consulta status de uma run.
 * @param {string} runId
 * @returns {Promise<{ status, datasetId, stats, progress }>}
 */
async function getRunStatus(runId) {
  if (!runId) throw new Error('runId obrigatório');

  const json = await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`);
  const data = json?.data || {};

  return {
    status: data.status, // READY|RUNNING|SUCCEEDED|FAILED|TIMING-OUT|TIMED-OUT|ABORTED
    datasetId: data.defaultDatasetId,
    stats: data.stats || {},
    progress: { itemCount: data.stats?.outputBodyBytes ? null : (data.stats?.itemCount ?? null) },
  };
}

/**
 * Busca os items do dataset gerado por uma run.
 * @param {string} datasetId
 * @param {Object} [options]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @param {string} [options.format='json']
 * @returns {Promise<Array<Object>>}
 */
async function getRunResults(datasetId, options = {}) {
  if (!datasetId) throw new Error('datasetId obrigatório');

  const params = new URLSearchParams();
  if (options.limit)  params.set('limit',  String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  params.set('format', options.format || 'json');
  params.set('clean', 'true');

  const json = await apifyFetch(`/datasets/${encodeURIComponent(datasetId)}/items?${params.toString()}`);
  return Array.isArray(json) ? json : [];
}

// ─── Mapeamento + score ──────────────────────────────────────────────────────

/**
 * Tenta extrair handle do Instagram a partir dos dados crus do place.
 */
function extractInstagramHandle(place) {
  // Apify às vezes retorna { socialLinks: { instagram: '...' } }
  // ou um campo `instagrams` ou `additionalInfo`
  const candidates = [
    place?.socialLinks?.instagram,
    place?.instagramUrl,
    place?.instagrams,
    Array.isArray(place?.urls) ? place.urls.find(u => /instagram\.com/i.test(u)) : null,
  ].filter(Boolean);

  for (const cand of candidates) {
    if (typeof cand !== 'string') continue;
    const match = cand.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (match) return '@' + match[1].replace(/\/+$/, '');
  }
  return null;
}

/**
 * Normaliza o JSON cru da Apify pro nosso schema, aplicando filtros pós-fetch
 * que a Apify não suporta nativamente (ex: "tem ou não tem site", min reviews).
 *
 * @returns {Object|null} Lead normalizado ou null se não passa nos filtros.
 */
function mapApifyPlaceToLead(place, filters = {}) {
  if (!place || typeof place !== 'object') return null;

  const company_name = place.title || place.name || place.subTitle || null;
  if (!company_name) return null;

  const phone = place.phone || place.phoneUnformatted || null;

  // Apify pode trazer site direto ou dentro de `website`
  const website = place.website || place.webSite || null;
  const has_website = !!(website && String(website).trim());

  // Address pode vir como string ou structured
  const address = place.address || place.formattedAddress
    || (place.location ? [place.street, place.city, place.state].filter(Boolean).join(', ') : null);

  const city  = place.city  || place.locatedIn || null;
  const state = place.state || place.region    || null;

  const google_rating = typeof place.totalScore === 'number'
    ? Number(place.totalScore.toFixed(2))
    : (typeof place.rating === 'number' ? Number(place.rating.toFixed(2)) : null);

  const review_count = Number.isInteger(place.reviewsCount) ? place.reviewsCount
    : (Number.isInteger(place.reviews) ? place.reviews : 0);

  const niche = place.categoryName || place.category || (Array.isArray(place.categories) ? place.categories[0] : null);
  const instagram_handle = extractInstagramHandle(place);

  // ── Filtros pós-fetch ──
  if (filters.minRating != null && google_rating != null && google_rating < Number(filters.minRating)) return null;
  if (filters.minReviews != null && review_count < Number(filters.minReviews)) return null;
  if (filters.hasWebsite === 'sim' && !has_website) return null;
  if (filters.hasWebsite === 'nao' && has_website) return null;

  return {
    company_name,
    phone,
    website,
    google_rating,
    review_count,
    address,
    city,
    state,
    niche,
    has_website,
    instagram_handle,
    raw_data: place,
  };
}

/**
 * Helper de top 3 cidades por estado — evita query única limitada a 120 results
 * quando o usuário só especifica o estado.
 */
const TOP_CITIES_BY_STATE = {
  AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
  AL: ['Maceió', 'Arapiraca', 'Palmeira dos Índios'],
  AM: ['Manaus', 'Parintins', 'Itacoatiara'],
  AP: ['Macapá', 'Santana', 'Laranjal do Jari'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte'],
  DF: ['Brasília', 'Taguatinga', 'Ceilândia'],
  ES: ['Vitória', 'Vila Velha', 'Serra'],
  GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'],
  MA: ['São Luís', 'Imperatriz', 'Caxias'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Contagem'],
  MS: ['Campo Grande', 'Dourados', 'Três Lagoas'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis'],
  PA: ['Belém', 'Ananindeua', 'Santarém'],
  PB: ['João Pessoa', 'Campina Grande', 'Santa Rita'],
  PE: ['Recife', 'Jaboatão dos Guararapes', 'Olinda'],
  PI: ['Teresina', 'Parnaíba', 'Picos'],
  PR: ['Curitiba', 'Londrina', 'Maringá'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias'],
  RN: ['Natal', 'Mossoró', 'Parnamirim'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes'],
  RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto'],
  SP: ['São Paulo', 'Campinas', 'Guarulhos'],
  TO: ['Palmas', 'Araguaína', 'Gurupi'],
};

/**
 * Monta array de queries pra Apify maximizando cobertura.
 */
function buildSearchStrings({ niche, state, city }) {
  if (!niche || !state) {
    throw new Error('niche e state obrigatórios em buildSearchStrings');
  }
  const stateUpper = String(state).toUpperCase();
  if (city && String(city).trim()) {
    return [`${niche} ${city.trim()} ${stateUpper}`];
  }
  const cities = TOP_CITIES_BY_STATE[stateUpper] || [];
  if (cities.length === 0) {
    return [`${niche} ${stateUpper}`];
  }
  return cities.map(c => `${niche} ${c} ${stateUpper}`);
}

/**
 * Score 0-100 indicando quão "atacável" é o lead pela Sigma.
 * Fórmula:
 *   + (rating < 4.5 && review_count > 10) → 25  (tem reviews ruins)
 *   + (!has_website)                       → 30 (sem site)
 *   + (review_count >= 50) → 15 | (>=20) → 10
 *   + (rating >= 4.0) → 15 (não é uma porcaria)
 *   + (phone) → 15 (dá pra ligar)
 */
function calculateSigmaScore(lead) {
  if (!lead) return 0;
  let score = 0;

  const rating = Number(lead.google_rating || 0);
  const reviews = Number(lead.review_count || 0);
  const hasSite = !!lead.has_website;
  const hasPhone = !!lead.phone;

  if (rating > 0 && rating < 4.5 && reviews > 10) score += 25;
  if (!hasSite) score += 30;
  if (reviews >= 50) score += 15;
  else if (reviews >= 20) score += 10;
  if (rating >= 4.0) score += 15;
  if (hasPhone) score += 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  startRun,
  getRunStatus,
  getRunResults,
  mapApifyPlaceToLead,
  buildSearchStrings,
  calculateSigmaScore,
};
