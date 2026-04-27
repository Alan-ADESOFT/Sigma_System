/**
 * models/comercial/leadAnalysisRunner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Executor da análise IA de um lead. Emite eventos SSE pelo emitter.
 *
 * Fases:
 *   1. context_gathering — monta string de contexto a partir do row
 *   2. web_search        — deepSearch com query do nicho/cidade
 *   3. site_scrape       — fetchUrlContent (se website existir)
 *   4. meta_ads_check    — best-effort GET na Ad Library
 *   5. generating        — runCompletionStream com prompt overridable
 *   6. parse + save      — extrai sigma_score e persiste
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { deepSearch } = require('../ia/deepSearch');
const { runCompletionStream } = require('../ia/completion');
const { fetchUrlContent } = require('../../infra/api/scraper');
const { getSetting } = require('../settings.model');
const { DEFAULT_LEAD_ANALYSIS_SYSTEM } = require('./prompts/leadAnalysis');
const { saveAnalysis } = require('./leadAnalysis.model');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLeadContext(lead) {
  const lines = [];
  if (lead.company_name)  lines.push(`Empresa: ${lead.company_name}`);
  if (lead.contact_name)  lines.push(`Contato: ${lead.contact_name}`);
  if (lead.phone)         lines.push(`Telefone: ${lead.phone}`);
  if (lead.email)         lines.push(`E-mail: ${lead.email}`);
  if (lead.website)       lines.push(`Site: ${lead.website}`);
  if (lead.instagram)     lines.push(`Instagram: ${lead.instagram}`);
  if (lead.niche)         lines.push(`Nicho: ${lead.niche}`);
  const loc = [lead.city, lead.state].filter(Boolean).join('/');
  if (loc)                lines.push(`Localização: ${loc}`);
  if (lead.google_rating != null) lines.push(`Google Rating: ${Number(lead.google_rating).toFixed(1)} (${lead.review_count || 0} reviews)`);
  if (lead.sigma_score != null)   lines.push(`Sigma Score base: ${lead.sigma_score}`);
  if (lead.notes)         lines.push(`Notas internas: ${lead.notes}`);
  return lines.join('\n');
}

function formatCollectedData(data) {
  const blocks = [];
  if (data.deepSearchResult) {
    blocks.push(`### Pesquisa web\n${data.deepSearchResult}`);
  }
  if (data.website) {
    blocks.push(`### Conteúdo do site\n${data.website}`);
  }
  if (data.metaAds) {
    blocks.push(`### Meta Ads Library\n${JSON.stringify(data.metaAds)}`);
  }
  if (blocks.length === 0) {
    return '(Nenhum dado externo coletado — análise baseada apenas no contexto interno)';
  }
  return blocks.join('\n\n');
}

/**
 * Extrai número do bloco "## 📊 Sigma Score" ou variações.
 */
function extractSigmaScore(text) {
  if (!text) return null;
  const patterns = [
    /##\s*[^\n]*sigma\s*score[^\n]*\n+\s*\**?\s*(\d{1,3})/i,
    /sigma\s*score[^\d]{0,20}(\d{1,3})/i,
    /score[^\d]{0,20}(\d{1,3})\s*\/\s*100/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

/**
 * Best-effort: busca a Ad Library Meta e tenta detectar anúncios ativos.
 * Retorna { hasActiveAds, snippet } ou null.
 */
async function checkMetaAdsLibrary(companyName) {
  if (!companyName) return null;
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${encodeURIComponent(companyName)}`;
    const result = await fetchUrlContent(url, 1500);
    if (!result.success) return null;
    const text = result.text || '';
    // Heurística simples — Meta Ad Library devolve "0 anúncios" ou "N anúncios"
    const m = text.match(/(\d{1,4})\s*(?:anúncios|results|ads)/i);
    return {
      hasActiveAds: m ? parseInt(m[1], 10) > 0 : null,
      adsCount: m ? parseInt(m[1], 10) : null,
      checkedUrl: url,
    };
  } catch {
    return null;
  }
}

/**
 * Traduz erros técnicos do completion stream em mensagens úteis pro usuário.
 */
function mapStreamError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('ai_model_strong') || msg.includes('variável de ambiente')) {
    return 'Modelo de IA não configurado. Configure AI_MODEL_STRONG no .env do servidor.';
  }
  if (msg.includes('openai_api_key') || msg.includes('anthropic_api_key')) {
    return 'Chave da API de IA ausente. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY no .env.';
  }
  if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('authentication')) {
    return 'Chave de API inválida ou expirada. Verifique no painel da OpenAI/Anthropic.';
  }
  if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota')) {
    return 'Limite de uso da API de IA atingido. Tente novamente em alguns minutos.';
  }
  if (msg.includes('insufficient') || msg.includes('billing')) {
    return 'Créditos insuficientes na conta de IA. Verifique billing no painel da OpenAI/Anthropic.';
  }
  if (msg.includes('context_length') || msg.includes('max_tokens')) {
    return 'Conteúdo muito grande pra processar. Reduza o site/contexto e tente novamente.';
  }
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('fetch failed')) {
    return 'Sem conexão com a API de IA. Verifique a internet do servidor e tente de novo.';
  }
  return `Falha na geração: ${err?.message || 'erro desconhecido'}`;
}

// ─── Runner principal ────────────────────────────────────────────────────────

async function runLeadAnalysis({ tenantId, lead, emitter, createdBy }) {
  const startedAt = Date.now();
  console.log('[INFO][LeadAnalysis:run] Iniciando', { tenantId, leadId: lead?.id });

  function emit(payload) {
    try { emitter?.emit('event', payload); } catch {}
  }

  try {
    // 1. Context gathering
    emit({ type: 'phase', phase: 'context_gathering', message: 'Montando contexto do lead...' });
    const leadContext = buildLeadContext(lead);

    const collectedData = { website: null, deepSearchResult: null, metaAds: null };
    const sourcesUsed   = { website: false, deepSearch: false, metaAds: false };
    let citations = [];

    // 2. Web search
    emit({ type: 'phase', phase: 'web_search', message: 'Pesquisando contexto público...' });
    try {
      const query = `${lead.company_name} ${lead.city || ''} ${lead.niche || ''}`.trim();
      const searchResult = await deepSearch(
        query,
        'Resuma em até 800 palavras o que é a empresa, o que ela faz, presença digital (site, redes), e qualquer sinal de marketing/anúncios. Em português do Brasil.'
      );
      collectedData.deepSearchResult = searchResult.text;
      citations = searchResult.citations || [];
      sourcesUsed.deepSearch = true;
      emit({ type: 'search_done', citationsCount: citations.length });
    } catch (err) {
      console.warn('[WARN][LeadAnalysis] deepSearch falhou — continuando', { error: err.message });
      emit({ type: 'phase_warn', phase: 'web_search', message: 'Pesquisa web falhou, continuando sem ela' });
    }

    // 3. Site scrape
    if (lead.website) {
      emit({ type: 'phase', phase: 'site_scrape', message: 'Extraindo conteúdo do site...' });
      try {
        const scrapeResult = await fetchUrlContent(lead.website, 4000);
        if (scrapeResult.success) {
          collectedData.website = scrapeResult.text;
          sourcesUsed.website = true;
        }
      } catch (err) {
        console.warn('[WARN][LeadAnalysis] scrape falhou', { url: lead.website, error: err.message });
      }
    }

    // 4. Meta Ads check
    emit({ type: 'phase', phase: 'meta_ads_check', message: 'Verificando anúncios ativos...' });
    try {
      const adsCheck = await checkMetaAdsLibrary(lead.company_name);
      collectedData.metaAds = adsCheck;
      sourcesUsed.metaAds = adsCheck !== null;
    } catch {}

    // 5. Completion streaming
    emit({ type: 'phase', phase: 'generating', message: 'Gerando análise...' });

    const customPrompt = await getSetting(tenantId, 'prompt_library_comercial_lead_analysis');
    const systemPrompt = (customPrompt || DEFAULT_LEAD_ANALYSIS_SYSTEM)
      .replace('{LEAD_CONTEXT}',  leadContext)
      .replace('{COLLECTED_DATA}', formatCollectedData(collectedData));

    let fullText = '';
    let modelUsed = '';

    try {
      const userMsg = 'Gere a análise completa do lead seguindo exatamente a estrutura especificada (Resumo Executivo, Pontos Positivos, Negativos, de Ataque, Abordagem, Sigma Score).';
      for await (const chunk of runCompletionStream('strong', systemPrompt, userMsg, 4000)) {
        fullText  = chunk.fullText;
        modelUsed = chunk.modelUsed;
        if (chunk.delta) {
          emit({ type: 'chunk', delta: chunk.delta, fullText });
        }
        if (chunk.done) break;
      }
    } catch (streamErr) {
      // Erro durante streaming → propaga com contexto claro
      console.error('[ERRO][LeadAnalysis] Stream falhou', {
        error: streamErr.message,
        stack: streamErr.stack,
      });
      const friendly = mapStreamError(streamErr);
      throw new Error(friendly);
    }

    if (!fullText || fullText.trim().length < 50) {
      throw new Error('IA retornou resposta vazia. Tente novamente — se persistir, verifique a chave de API do modelo.');
    }

    // 6. Parse + save
    const sigmaScore = extractSigmaScore(fullText);

    const saved = await saveAnalysis(tenantId, {
      pipelineLeadId: lead.id,
      analysisText: fullText,
      sigmaScore,
      citations,
      sourcesUsed,
      modelUsed,
      tokensInput: 0,
      tokensOutput: 0,
      durationMs: Date.now() - startedAt,
      createdBy,
    });

    // Activity 'ai_analysis' na timeline
    try {
      const { createActivity } = require('./activity.model');
      await createActivity(tenantId, {
        pipelineLeadId: lead.id,
        type: 'ai_analysis',
        metadata: { analysisId: saved.id, sigmaScore, sourcesUsed },
        createdBy,
      });
    } catch (err) {
      console.warn('[WARN][LeadAnalysis:run] activity falhou', { error: err.message });
    }

    // Notification (respeita toggle comercial_notify_analysis_done)
    try {
      const { getSetting } = require('../settings.model');
      const notifyEnabled = await getSetting(tenantId, 'comercial_notify_analysis_done');
      if (notifyEnabled !== 'false') {
        const { createNotification } = require('../clientForm');
        await createNotification(
          tenantId,
          'comercial_analysis_done',
          'Análise IA concluída',
          `Análise de ${lead.company_name} pronta — Sigma Score: ${sigmaScore ?? '—'}/100`,
          null,
          { pipelineLeadId: lead.id, analysisId: saved.id, sigmaScore }
        );
      }
    } catch (err) {
      console.warn('[WARN][LeadAnalysis:run] notification falhou', { error: err.message });
    }

    emit({
      type: 'done',
      analysisId: saved.id,
      sigmaScore,
      fullText,
      citations,
      sourcesUsed,
      durationMs: Date.now() - startedAt,
    });

    console.log('[SUCESSO][LeadAnalysis:run] Concluído', { analysisId: saved.id, sigmaScore });
    return saved;
  } catch (err) {
    console.error('[ERRO][LeadAnalysis:run]', { error: err.message, stack: err.stack });
    emit({ type: 'error', message: err.message });
    throw err;
  }
}

module.exports = { runLeadAnalysis };
