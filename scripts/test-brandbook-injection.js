/**
 * scripts/test-brandbook-injection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste manual scriptável: confirma que uma geração de imagem pra um cliente
 * com brandbook ATIVO realmente injeta as cores do brandbook no prompt
 * otimizado.
 *
 * Uso:
 *   node scripts/test-brandbook-injection.js <clientId>
 *
 * O que faz:
 *   1. Carrega o brandbook ativo do cliente (getActiveBrandbook).
 *   2. Cria um job mockado via createJob com bypass_cache=true (forçando o
 *      LLM a regerar — não pode pegar prompt cacheado).
 *   3. Aguarda o worker processar (timeout 60s).
 *   4. Lê o optimized_prompt e checa se contém PELO MENOS UMA das cores
 *      hex declaradas em brandbook.structured_data.colors.
 *   5. Exit 0 (pass) com diagnóstico, ou 1 (fail) com detalhes.
 *
 * Pré-requisito: o servidor Next + worker precisa estar rodando localmente
 * (`npm run dev`) e o ADMIN_TENANT_ID configurado em .env.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Carrega .env e .env.local manualmente sem dependencia de dotenv
// (evita instalar pacote so pra um script de teste).
const fs = require('fs');
const path = require('path');
function loadDotenv(file) {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let [, k, v] = m;
      v = v.replace(/^["']|["']$/g, '');
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* arquivo inexistente — OK */ }
}
loadDotenv('.env.local');
loadDotenv('.env');

const { getActiveBrandbook } = require('../models/brandbook.model');
const { createJob, getJobById } = require('../models/imageJob.model');
const { notifyNewJob } = require('../infra/imageJobEmitter');

const TIMEOUT_MS = 60_000;
const POLL_MS = 1_000;

function exit(code, msg) {
  console[code === 0 ? 'log' : 'error'](msg);
  process.exit(code);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Extrai cores hex de várias formas que o brandbook pode ter (string em paleta,
 * array de cores, objeto com primary/secondary etc).
 */
function extractHexColors(structuredData) {
  if (!structuredData) return [];
  const sd = typeof structuredData === 'string'
    ? (() => { try { return JSON.parse(structuredData); } catch { return {}; } })()
    : structuredData;
  const found = new Set();

  // Procura recursivamente strings que parecem hex (#ABCDEF ou #ABC)
  function walk(v) {
    if (!v) return;
    if (typeof v === 'string') {
      const matches = v.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
      if (matches) matches.forEach(m => found.add(m.toLowerCase()));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') Object.values(v).forEach(walk);
  }
  walk(sd);
  return Array.from(found);
}

async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    exit(1, '[USO] node scripts/test-brandbook-injection.js <clientId>');
  }

  const tenantId = process.env.ADMIN_TENANT_ID;
  if (!tenantId) {
    exit(1, '[ERRO] ADMIN_TENANT_ID não configurado no .env');
  }

  // 1. Brandbook ativo
  console.log('[1/4] carregando brandbook ativo...');
  const brandbook = await getActiveBrandbook(clientId, tenantId);
  if (!brandbook) {
    exit(1, `[FAIL] cliente ${clientId} não tem brandbook ativo`);
  }
  console.log(`     brandbook ${brandbook.id} carregado`);

  const colors = extractHexColors(brandbook.structured_data);
  if (colors.length === 0) {
    exit(1, `[FAIL] brandbook não declara nenhuma cor hex em structured_data`);
  }
  console.log(`     cores declaradas: ${colors.join(', ')}`);

  // 2. Cria job mockado
  console.log('[2/4] criando job mockado (bypass_cache=true)...');
  let job;
  try {
    job = await createJob({
      tenantId,
      clientId,
      userId: tenantId, // admin = self
      format: 'square_post',
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      model: 'auto',
      provider: 'auto',
      brandbookId: brandbook.id,
      brandbookUsed: true,
      rawDescription: '[TESTE] post para Instagram sobre transformação digital',
      referenceImageUrls: [],
      referenceImageMetadata: [],
      bypassCache: true,
    });
  } catch (err) {
    exit(1, `[FAIL] createJob: ${err.message}`);
  }
  console.log(`     job ${job.id} enfileirado`);

  // Notifica worker pra acordar
  try { notifyNewJob(job.id); } catch { /* worker pode estar fora */ }

  // 3. Aguarda processamento
  console.log('[3/4] aguardando worker (até 60s)...');
  const t0 = Date.now();
  let final = null;
  while (Date.now() - t0 < TIMEOUT_MS) {
    const cur = await getJobById(job.id, tenantId);
    if (cur && ['done', 'error', 'cancelled'].includes(cur.status)) {
      final = cur;
      break;
    }
    process.stdout.write('.');
    await sleep(POLL_MS);
  }
  process.stdout.write('\n');

  if (!final) {
    exit(1, `[FAIL] worker não processou em ${TIMEOUT_MS / 1000}s — verifique se está rodando`);
  }
  if (final.status !== 'done') {
    exit(1, `[FAIL] job terminou em status=${final.status}: ${final.error_message || '?'}`);
  }

  // 4. Asserções
  console.log('[4/4] validando injeção...');
  const prompt = (final.optimized_prompt || '').toLowerCase();
  if (!prompt) {
    exit(1, '[FAIL] optimized_prompt vazio');
  }

  // Colors no prompt — basta UMA aparecer
  const hits = colors.filter(c => prompt.includes(c.toLowerCase()));
  console.log(`     prompt (${prompt.length} chars):`);
  console.log(`     "${prompt.slice(0, 200)}..."`);
  console.log(`     cores encontradas: ${hits.length === 0 ? 'NENHUMA' : hits.join(', ')}`);
  console.log(`     brandbook_used flag: ${final.brandbook_used}`);

  if (!final.brandbook_used) {
    exit(1, '[FAIL] brandbook_used=false — flag não foi persistida');
  }
  if (hits.length === 0) {
    exit(1, `[FAIL] prompt otimizado não contém nenhuma das cores ${colors.join(', ')}`);
  }

  exit(0, `[PASS] brandbook injetado corretamente. ${hits.length}/${colors.length} cores no prompt.`);
}

main().catch(err => {
  console.error('[ERRO INESPERADO]', err);
  process.exit(1);
});
