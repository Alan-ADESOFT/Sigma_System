/**
 * pages/api/onboarding/submit-stage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/onboarding/submit-stage
 * Body: { token, stageNumber, responses, timeSpentSec?, draftOnly? }
 *
 * Endpoint público (sem auth) — só o token na URL controla acesso.
 *
 * Dois modos:
 *   draftOnly: true  → auto-save (não marca submitted, só mescla JSONB)
 *   draftOnly: false → submit final (marca submitted, atualiza progresso geral,
 *                                    gera resumo IA opcional, retorna teaser)
 *
 * O auto-save é chamado sempre que o cliente troca de campo (com debounce no
 * frontend). O submit final é chamado pelo botão "Enviar Respostas".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProgressByToken,
  saveStageResponseDraft,
  submitStage,
  getNextStageTeaser,
  getStageConfig,
} from '../../../models/onboarding';

/* ─── Helper: valida se um valor pode ser considerado preenchido ─── */
function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return true;
  return !!value;
}

/* ─── Valida required de uma etapa contra as respostas enviadas ───
 * Retorna lista de IDs de campos faltantes (ou [] se tudo ok). */
function findMissingRequired(questions, responses) {
  const missing = [];
  for (const q of (questions || [])) {
    if (!q.required) continue;

    if (q.type === 'composite') {
      // Cada subcampo do composite vira required individualmente
      for (const sub of (q.fields || [])) {
        if (!isFilled(responses?.[sub.id])) missing.push(sub.id);
      }
      continue;
    }

    if (!isFilled(responses?.[q.id])) missing.push(q.id);
  }
  return missing;
}

/* ─── Sanitiza payload pra não aceitar JSONB malicioso ───
 * Limita strings em 8000 chars, arrays em 100 itens, objetos em 50 keys.
 * Garante que só primitivos/arrays/objetos comuns vão pro banco. */
function sanitizeResponses(responses) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return {};
  const out = {};
  let keyCount = 0;

  for (const [key, value] of Object.entries(responses)) {
    if (keyCount++ >= 200) break;             // hard cap de keys por etapa
    if (typeof key !== 'string' || key.length > 100) continue;

    if (typeof value === 'string') {
      out[key] = value.slice(0, 8000);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value
        .slice(0, 100)
        .filter(v => typeof v === 'string' || typeof v === 'number')
        .map(v => typeof v === 'string' ? v.slice(0, 500) : v);
    } else if (value === null) {
      out[key] = null;
    }
    // Objetos aninhados são descartados — JSONB plano só
  }

  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token, stageNumber, responses, timeSpentSec, draftOnly } = req.body || {};

  // Validação básica de tipo
  if (!token || typeof token !== 'string' || token.length > 200) {
    return res.status(400).json({ success: false, error: 'Token inválido' });
  }
  const stageNum = parseInt(stageNumber, 10);
  if (!stageNum || stageNum < 1 || stageNum > 12) {
    return res.status(400).json({ success: false, error: 'stageNumber inválido (deve ser 1 a 12)' });
  }
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return res.status(400).json({
      success: false,
      error: 'responses deve ser um objeto { questionId: valor }',
    });
  }

  // Sanitiza o payload — evita strings gigantes, arrays absurdos, objetos
  // aninhados, etc. Tem que rolar antes de tocar no banco.
  const cleanResponses = sanitizeResponses(responses);

  try {
    console.log('[INFO][API:onboarding/submit-stage] start', {
      token: token.slice(0, 8) + '...',
      stageNumber: stageNum,
      draftOnly: !!draftOnly,
      fieldCount: Object.keys(cleanResponses).length,
    });

    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Token inválido' });
    }
    if (progress.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Onboarding já concluído' });
    }

    // Modo rascunho: só mescla as respostas e responde (NÃO valida required)
    if (draftOnly) {
      const row = await saveStageResponseDraft(
        progress.client_id,
        progress.tenant_id,
        stageNum,
        cleanResponses
      );
      return res.json({ success: true, draft: true, savedAt: new Date().toISOString(), id: row?.id });
    }

    /* ── Submit final: VALIDA required no servidor ──
     * Frontend valida primeiro mas não confia. Carrega config da etapa
     * (que pode ter sido editada pelo admin) e checa cada required. */
    const stageConfig = await getStageConfig(progress.tenant_id, stageNum);
    if (!stageConfig) {
      return res.status(404).json({ success: false, error: 'Etapa não encontrada na configuração' });
    }

    const questions = stageConfig.questions_json || [];
    const missing = findMissingRequired(questions, cleanResponses);
    if (missing.length > 0) {
      console.log('[WARN][API:onboarding/submit-stage] required faltando', { missing });
      return res.status(400).json({
        success: false,
        error: `Faltam ${missing.length} campo${missing.length > 1 ? 's' : ''} obrigatório${missing.length > 1 ? 's' : ''}.`,
        missingFields: missing,
      });
    }

    // Tudo ok — submete
    const row = await submitStage(
      progress.client_id,
      progress.tenant_id,
      stageNum,
      cleanResponses,
      timeSpentSec
    );

    // Monta o teaser da próxima etapa pra mostrar na celebração
    const nextStage = getNextStageTeaser(stageNum);

    console.log('[SUCESSO][API:onboarding/submit-stage] done', {
      stageNumber: stageNum,
      hasNext: !!nextStage,
    });

    return res.json({
      success: true,
      submitted: true,
      stageNumber: stageNum,
      submittedAt: row?.submitted_at,
      nextStage,
    });

  } catch (err) {
    console.error('[ERRO][API:onboarding/submit-stage]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
