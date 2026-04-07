/**
 * models/onboarding.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Model centralizado do sistema de onboarding por etapas (15 dias).
 *
 * Tudo que é "regra de negócio" do onboarding mora aqui:
 *   · Gerenciar progresso do cliente (status, dia atual, token)
 *   · Carregar configuração das etapas (default seed ou customizada)
 *   · Salvar respostas, marcar vídeo assistido, submeter etapa
 *   · Calcular dia atual e próxima etapa (pulando dias de descanso)
 *   · Limites do botão de áudio IA (6 usos/dia)
 *   · Operações usadas pelo cron (find clients due, log notification)
 *
 * Tabelas tocadas:
 *   onboarding_progress             — uma linha por cliente
 *   onboarding_stages_config        — uma linha por etapa por tenant
 *   onboarding_rest_days_config     — uma linha por dia-de-descanso por tenant
 *   onboarding_stage_responses      — uma linha por (cliente, etapa)
 *   onboarding_audio_usage          — log de uso do botão de microfone
 *   onboarding_notifications_log    — log do cron (UNIQUE evita reenvios)
 *
 * Usado por:
 *   pages/api/onboarding/*          — APIs públicas (current-stage, submit, ...)
 *   pages/api/onboarding/admin/*    — APIs do admin (config das etapas)
 *   pages/api/cron/onboarding-daily — disparador diário do WhatsApp
 *
 * NOTA: Este arquivo usa ES modules (import/export). Outros models do projeto
 * usam CommonJS — a precedência é o `pages/api/cron/form-reminder.js` que
 * mistura import e require sem problema. Webpack do Next compila tudo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'crypto';
import { query, queryOne } from '../infra/db';
import {
  ONBOARDING_STAGES,
  REST_DAYS,
  REST_DAY_NUMBERS,
  TOTAL_DAYS,
  countQuestions,
} from '../assets/data/onboardingQuestions';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════════════════════════════════ */

// Limites do botão de microfone com IA — hard-coded propositalmente.
// Aumentar isso significa custo de API real (Whisper + GPT).
export const AUDIO_DAILY_LIMIT  = 6;
export const AUDIO_MAX_DURATION = 120; // 2 minutos por gravação

// Token de acesso público — validade.
const TOKEN_VALIDITY_DAYS = 30;

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS DE TEMPO E DIA
═══════════════════════════════════════════════════════════════════════════ */

// Fuso fixo do produto. Toda contagem de dias é feita em horário de Brasília
// pra evitar descompasso quando o servidor está em UTC (Vercel, AWS, etc).
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna o "dia do calendário" de um Date no horário de Brasília como
 * um número inteiro YYYYMMDD (ex: 20260407). Permite comparar dois dias
 * sem se preocupar com horas/timezone do servidor.
 *
 * Usa Intl.DateTimeFormat que é a forma confiável e zero-dep de fazer
 * conversão de fuso em Node/browser modernos.
 */
function brasiliaDayKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return parseInt(`${y}${m}${d}`, 10);
}

/**
 * Calcula em que dia da jornada o cliente está, baseado em quando começou.
 * Retorna 0 se nunca iniciou. Dia 1 = mesma data de início (em BRT).
 *
 * Importante: este cálculo é "calendário corrido NO HORÁRIO DE BRASÍLIA".
 * Se o cliente começou num sábado e é segunda, ele está no dia 3 —
 * independente de ter aberto o link ou não. Isso é PROPOSITAL: o sistema
 * é diário e respeita o ritmo do calendário do cliente, não do servidor.
 *
 * Por que BRT explícito? Sem isso, o servidor (que normalmente roda em UTC)
 * pode achar que já é "amanhã" às 21h do horário do cliente, ou pior, achar
 * que ainda é "ontem" às 03h da manhã BRT.
 */
export function computeCurrentDay(startedAt) {
  if (!startedAt) return 0;
  const start = new Date(startedAt);
  const now   = new Date();

  // Converte ambos os instantes pro "dia BRT" (YYYYMMDD)
  const startKey = brasiliaDayKey(start);
  const nowKey   = brasiliaDayKey(now);

  // Diferença em dias usando Date.UTC pra calcular o gap entre as duas chaves
  // de forma segura (mesmo que cruze meses/anos)
  const startDate = new Date(
    Math.floor(startKey / 10000),
    (Math.floor(startKey / 100) % 100) - 1,
    startKey % 100
  );
  const nowDate = new Date(
    Math.floor(nowKey / 10000),
    (Math.floor(nowKey / 100) % 100) - 1,
    nowKey % 100
  );
  const diffDays = Math.floor((nowDate - startDate) / (1000 * 60 * 60 * 24));
  return diffDays + 1; // dia 1 = mesma data que started_at em BRT
}

/**
 * Retorna a etapa que deveria estar ativa em determinado dia da jornada.
 * Se o dia for de descanso, retorna null (a UI mostra mensagem específica).
 * Se o dia ultrapassou o fim, retorna null e quem chama trata como completed.
 */
export function getStageByDay(dayNumber) {
  if (dayNumber < 1) return null;
  if (REST_DAY_NUMBERS.includes(dayNumber)) return null;
  return ONBOARDING_STAGES.find(s => s.day === dayNumber) || null;
}

/**
 * Próxima etapa após a atual, pulando dias de descanso automaticamente.
 * Usado pelo botão "Adiantar Dia" e pelo cálculo do teaser.
 */
export function getNextStageAfter(currentStageNumber) {
  const idx = ONBOARDING_STAGES.findIndex(s => s.stage === currentStageNumber);
  if (idx < 0 || idx >= ONBOARDING_STAGES.length - 1) return null;
  return ONBOARDING_STAGES[idx + 1];
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESSO DO CLIENTE
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Busca o progresso pelo client_id. Pode retornar null se nunca foi iniciado.
 */
export async function getProgress(clientId) {
  return queryOne(
    `SELECT * FROM onboarding_progress WHERE client_id = $1`,
    [clientId]
  );
}

/**
 * Busca progresso pelo token público (URL /onboarding/{token}).
 * Inclui dados do cliente já no JOIN — economiza uma query.
 */
export async function getProgressByToken(token) {
  return queryOne(
    `SELECT
        op.*,
        mc.company_name,
        mc.phone,
        mc.email
      FROM onboarding_progress op
      JOIN marketing_clients mc ON mc.id = op.client_id
      WHERE op.token = $1`,
    [token]
  );
}

/**
 * Cria o progresso de um cliente OU retorna o existente.
 * Já gera o token de acesso público (UUID v4).
 *
 * NOTA: o status começa em 'not_started'. Quem chama deve usar
 * `startOnboarding()` para de fato disparar a jornada.
 */
export async function getOrCreateProgress(clientId, tenantId) {
  console.log('[INFO][Onboarding:getOrCreateProgress] start', { clientId });

  const existing = await getProgress(clientId);
  if (existing) {
    console.log('[INFO][Onboarding:getOrCreateProgress] existing', { id: existing.id, status: existing.status });
    return existing;
  }

  const token = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + TOKEN_VALIDITY_DAYS);

  const row = await queryOne(
    `INSERT INTO onboarding_progress (client_id, tenant_id, status, token, token_expires)
     VALUES ($1, $2, 'not_started', $3, $4)
     RETURNING *`,
    [clientId, tenantId, token, expires.toISOString()]
  );

  console.log('[SUCESSO][Onboarding:getOrCreateProgress] created', { id: row.id });
  return row;
}

/**
 * Inicia (ativa) o onboarding de um cliente.
 * Chamado pelo admin (ex: ao apertar "Iniciar Onboarding" na tela do cliente).
 * Marca started_at = agora, status = 'active', current_day = 1.
 */
export async function startOnboarding(clientId, tenantId) {
  console.log('[INFO][Onboarding:startOnboarding] start', { clientId });

  // Garante que existe um progress
  await getOrCreateProgress(clientId, tenantId);

  const row = await queryOne(
    `UPDATE onboarding_progress
     SET status = 'active',
         started_at = COALESCE(started_at, now()),
         current_day = 1,
         current_stage = 1
     WHERE client_id = $1
     RETURNING *`,
    [clientId]
  );

  // Marca também no marketing_clients pra ficar visível na lista
  await query(
    `UPDATE marketing_clients
     SET onboarding_started_at = COALESCE(onboarding_started_at, now()),
         onboarding_status = 'active'
     WHERE id = $1`,
    [clientId]
  );

  console.log('[SUCESSO][Onboarding:startOnboarding] activated', { token: row.token });
  return row;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAÇÃO DAS ETAPAS (admin)
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Garante que existe a configuração default das 12 etapas no banco.
 * Idempotente: se já tem registro pra (tenant, stage_number), faz nothing.
 *
 * Roda automaticamente na primeira chamada de getStagesConfig pra esse tenant.
 */
export async function seedDefaultConfig(tenantId) {
  console.log('[INFO][Onboarding:seedDefaultConfig] start', { tenantId });

  // Conta quantas etapas já existem pra esse tenant
  const existing = await queryOne(
    `SELECT COUNT(*)::int AS count FROM onboarding_stages_config WHERE tenant_id = $1`,
    [tenantId]
  );

  // Se já tem todas as 12 etapas, pula
  if (existing && existing.count >= ONBOARDING_STAGES.length) {
    console.log('[INFO][Onboarding:seedDefaultConfig] already seeded', { existing: existing.count });
  } else {
    // Insere uma por uma — mais simples e dá pra logar individualmente
    for (const stage of ONBOARDING_STAGES) {
      await query(
        `INSERT INTO onboarding_stages_config
           (tenant_id, stage_number, title, description, video_url, video_duration,
            questions_json, day_release, is_rest_day, time_estimate, insight_text, sort_order)
         VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, false, $7, $8, $9)
         ON CONFLICT (tenant_id, stage_number) DO NOTHING`,
        [
          tenantId,
          stage.stage,
          stage.title,
          stage.description,
          JSON.stringify(stage.questions),
          stage.day,
          stage.timeEstimate,
          stage.insight || null,
          stage.stage,
        ]
      );
    }
  }

  // Garante também os dias de descanso na tabela específica
  for (const day of REST_DAY_NUMBERS) {
    await query(
      `INSERT INTO onboarding_rest_days_config (tenant_id, day_number, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, day_number) DO NOTHING`,
      [tenantId, day, REST_DAYS[day]]
    );
  }

  console.log('[SUCESSO][Onboarding:seedDefaultConfig] done', { tenantId });
}

/**
 * Retorna a configuração completa de TODAS as etapas pro admin.
 * Inclui também os dias de descanso (mesclados na lista).
 *
 * O retorno é uma lista única ordenada por dia da jornada — facilita
 * o render do timeline horizontal de 15 dias na tela admin.
 */
export async function getStagesConfig(tenantId) {
  // Garante que está semeado
  await seedDefaultConfig(tenantId);

  const stages = await query(
    `SELECT * FROM onboarding_stages_config
     WHERE tenant_id = $1
     ORDER BY day_release ASC`,
    [tenantId]
  );

  const restDays = await query(
    `SELECT * FROM onboarding_rest_days_config
     WHERE tenant_id = $1
     ORDER BY day_number ASC`,
    [tenantId]
  );

  return { stages, restDays };
}

/**
 * Busca a config de UMA etapa específica.
 * Usado pela API pública (current-stage) pra renderizar o vídeo + perguntas.
 */
export async function getStageConfig(tenantId, stageNumber) {
  await seedDefaultConfig(tenantId);
  return queryOne(
    `SELECT * FROM onboarding_stages_config
     WHERE tenant_id = $1 AND stage_number = $2`,
    [tenantId, stageNumber]
  );
}

/**
 * Atualiza uma etapa (admin).
 * Aceita parcialmente — campos undefined NÃO sobrescrevem (COALESCE).
 */
export async function upsertStageConfig(tenantId, stageNumber, data) {
  console.log('[INFO][Onboarding:upsertStageConfig] start', { tenantId, stageNumber });

  const row = await queryOne(
    `UPDATE onboarding_stages_config
     SET title          = COALESCE($3, title),
         description    = COALESCE($4, description),
         video_url      = COALESCE($5, video_url),
         video_duration = COALESCE($6, video_duration),
         questions_json = COALESCE($7::jsonb, questions_json),
         time_estimate  = COALESCE($8, time_estimate),
         insight_text   = COALESCE($9, insight_text),
         active         = COALESCE($10, active)
     WHERE tenant_id = $1 AND stage_number = $2
     RETURNING *`,
    [
      tenantId,
      stageNumber,
      data.title ?? null,
      data.description ?? null,
      data.video_url ?? null,
      data.video_duration ?? null,
      data.questions_json ? JSON.stringify(data.questions_json) : null,
      data.time_estimate ?? null,
      data.insight_text ?? null,
      typeof data.active === 'boolean' ? data.active : null,
    ]
  );

  console.log('[SUCESSO][Onboarding:upsertStageConfig] done', { id: row?.id });
  return row;
}

/**
 * Atualiza a mensagem de um dia de descanso (admin).
 */
export async function upsertRestDayConfig(tenantId, dayNumber, message) {
  return queryOne(
    `INSERT INTO onboarding_rest_days_config (tenant_id, day_number, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, day_number) DO UPDATE SET message = EXCLUDED.message
     RETURNING *`,
    [tenantId, dayNumber, message]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESPOSTAS DAS ETAPAS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Busca a row de respostas (existente ou null) — não cria.
 */
export async function getStageResponse(clientId, stageNumber) {
  return queryOne(
    `SELECT * FROM onboarding_stage_responses
     WHERE client_id = $1 AND stage_number = $2`,
    [clientId, stageNumber]
  );
}

/**
 * Salva respostas parciais (auto-save). Não marca como submitted.
 * Mescla com o JSONB existente — não sobrescreve campos não enviados.
 */
export async function saveStageResponseDraft(clientId, tenantId, stageNumber, responses) {
  console.log('[INFO][Onboarding:saveStageResponseDraft] start', { clientId, stageNumber });

  const row = await queryOne(
    `INSERT INTO onboarding_stage_responses
       (client_id, tenant_id, stage_number, responses_json)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (client_id, stage_number) DO UPDATE
       SET responses_json = COALESCE(onboarding_stage_responses.responses_json, '{}'::jsonb) || EXCLUDED.responses_json
     RETURNING *`,
    [clientId, tenantId, stageNumber, JSON.stringify(responses || {})]
  );

  return row;
}

/**
 * Marca o vídeo da etapa como assistido. Idempotente.
 */
export async function markVideoWatched(clientId, tenantId, stageNumber) {
  console.log('[INFO][Onboarding:markVideoWatched] start', { clientId, stageNumber });

  return queryOne(
    `INSERT INTO onboarding_stage_responses
       (client_id, tenant_id, stage_number, video_watched, video_watched_at)
     VALUES ($1, $2, $3, true, now())
     ON CONFLICT (client_id, stage_number) DO UPDATE
       SET video_watched = true,
           video_watched_at = COALESCE(onboarding_stage_responses.video_watched_at, now())
     RETURNING *`,
    [clientId, tenantId, stageNumber]
  );
}

/**
 * Submete a etapa como concluída (botão "Enviar Respostas").
 * Atualiza também o progresso geral do cliente: current_stage,
 * last_stage_at e — se for a etapa 12 — completed_at + status.
 */
export async function submitStage(clientId, tenantId, stageNumber, responses, timeSpentSec) {
  console.log('[INFO][Onboarding:submitStage] start', { clientId, stageNumber });

  // 1. Salva/mescla as respostas finais e marca submitted
  const responseRow = await queryOne(
    `INSERT INTO onboarding_stage_responses
       (client_id, tenant_id, stage_number, responses_json,
        submitted, submitted_at, time_spent_sec)
     VALUES ($1, $2, $3, $4::jsonb, true, now(), $5)
     ON CONFLICT (client_id, stage_number) DO UPDATE
       SET responses_json = COALESCE(onboarding_stage_responses.responses_json, '{}'::jsonb) || EXCLUDED.responses_json,
           submitted = true,
           submitted_at = now(),
           time_spent_sec = COALESCE(EXCLUDED.time_spent_sec, onboarding_stage_responses.time_spent_sec)
     RETURNING *`,
    [clientId, tenantId, stageNumber, JSON.stringify(responses || {}), timeSpentSec || null]
  );

  // 2. Atualiza o progresso geral
  const isLast = stageNumber >= ONBOARDING_STAGES.length;
  if (isLast) {
    await query(
      `UPDATE onboarding_progress
       SET current_stage = $2,
           last_stage_at = now(),
           completed_at = now(),
           status = 'completed'
       WHERE client_id = $1`,
      [clientId, stageNumber]
    );
    await query(
      `UPDATE marketing_clients SET onboarding_status = 'completed' WHERE id = $1`,
      [clientId]
    );
  } else {
    await query(
      `UPDATE onboarding_progress
       SET current_stage = $2,
           last_stage_at = now()
       WHERE client_id = $1`,
      [clientId, stageNumber]
    );
  }

  console.log('[SUCESSO][Onboarding:submitStage] done', { stageNumber, isLast });
  return responseRow;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADIANTAR DIA (botão pós-celebração)
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Adianta o dia do onboarding pulando dias de descanso.
 * Pré-requisitos: a etapa atual já tem que estar submitted.
 *
 * Lógica:
 *   1. Pega a próxima etapa da sequência (etapa N+1)
 *   2. Recalcula started_at PARA TRÁS pra que computeCurrentDay() retorne
 *      o dia da próxima etapa.
 *
 * Por que ajustar started_at em vez de current_day diretamente?
 * Porque o dia atual é DERIVADO de started_at. Se eu só atualizar
 * current_day, no dia seguinte o cron vai recomputar e voltar atrás.
 * Ajustando started_at, todo cálculo subsequente fica consistente.
 */
export async function advanceDay(clientId) {
  console.log('[INFO][Onboarding:advanceDay] start', { clientId });

  const progress = await getProgress(clientId);
  if (!progress) throw new Error('Onboarding não iniciado');
  if (progress.status === 'completed') throw new Error('Onboarding já concluído');

  // A etapa atual precisa estar submetida
  const currentResp = await getStageResponse(clientId, progress.current_stage);
  if (!currentResp || !currentResp.submitted) {
    throw new Error('Etapa atual ainda não foi enviada');
  }

  // Próxima etapa (pulando descansos)
  const nextStage = getNextStageAfter(progress.current_stage);
  if (!nextStage) {
    throw new Error('Não há próxima etapa — onboarding está no fim');
  }

  // Calcula a nova data de início pra que current_day = nextStage.day
  // started_at = hoje - (nextStage.day - 1) dias
  const newStart = new Date();
  newStart.setDate(newStart.getDate() - (nextStage.day - 1));
  // Zera horas pra alinhar com o cálculo de computeCurrentDay
  newStart.setHours(0, 0, 0, 0);

  const updated = await queryOne(
    `UPDATE onboarding_progress
     SET started_at = $2,
         current_day = $3,
         current_stage = $4
     WHERE client_id = $1
     RETURNING *`,
    [clientId, newStart.toISOString(), nextStage.day, nextStage.stage]
  );

  console.log('[SUCESSO][Onboarding:advanceDay] done', {
    newDay: nextStage.day,
    newStage: nextStage.stage,
  });

  return { progress: updated, nextStage };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÁUDIO IA — controle de uso
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Conta quantos áudios o cliente já enviou hoje.
 */
export async function getAudioUsageToday(clientId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS count
     FROM onboarding_audio_usage
     WHERE client_id = $1 AND usage_date = CURRENT_DATE`,
    [clientId]
  );
  return row?.count || 0;
}

/**
 * Loga um uso do botão de áudio + a transcrição + o parsing por IA.
 */
export async function logAudioUsage(clientId, stageNumber, audioDurationSec, transcription, parsedAnswers) {
  return queryOne(
    `INSERT INTO onboarding_audio_usage
       (client_id, stage_number, audio_duration, transcription, parsed_answers)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [clientId, stageNumber, audioDurationSec, transcription || null, JSON.stringify(parsedAnswers || {})]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CRON — busca clientes ativos e log de notificações
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Lista todos os onboardings ativos com o cliente associado.
 * Usado pelo cron diário pra computar quem precisa de mensagem.
 *
 * Já vem com phone, company_name e tenant_id pra economizar joins.
 */
export async function findActiveOnboardings(tenantId = null) {
  const params = [];
  let where = `op.status = 'active' AND mc.phone IS NOT NULL AND mc.phone != ''`;
  if (tenantId) {
    params.push(tenantId);
    where += ` AND op.tenant_id = $${params.length}`;
  }

  return query(
    `SELECT
        op.id           AS progress_id,
        op.client_id,
        op.tenant_id,
        op.token,
        op.started_at,
        op.current_stage,
        op.current_day,
        mc.company_name,
        mc.phone
      FROM onboarding_progress op
      JOIN marketing_clients mc ON mc.id = op.client_id
      WHERE ${where}`,
    params
  );
}

/**
 * Verifica se uma notificação específica já foi enviada hoje.
 * Evita duplicatas se o cron rodar duas vezes no mesmo dia.
 */
export async function wasNotificationSent(clientId, dayNumber, type) {
  const row = await queryOne(
    `SELECT id FROM onboarding_notifications_log
     WHERE client_id = $1 AND day_number = $2 AND type = $3`,
    [clientId, dayNumber, type]
  );
  return !!row;
}

/**
 * Loga uma notificação enviada. Idempotente via UNIQUE.
 */
export async function logNotificationSent(clientId, dayNumber, type, message) {
  try {
    return await queryOne(
      `INSERT INTO onboarding_notifications_log (client_id, day_number, type, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clientId, dayNumber, type, (message || '').slice(0, 2000)]
    );
  } catch (err) {
    // Se já existe (UNIQUE violation), só loga e segue
    if (err.message?.includes('duplicate key')) return null;
    throw err;
  }
}

/**
 * Atualiza o current_day no banco baseado no started_at.
 * Chamado pelo cron a cada execução pra manter o campo em dia
 * (útil pra exibir no admin sem precisar recalcular).
 */
export async function syncCurrentDay(clientId) {
  const progress = await getProgress(clientId);
  if (!progress) return null;
  const day = computeCurrentDay(progress.started_at);
  return queryOne(
    `UPDATE onboarding_progress
     SET current_day = $2
     WHERE client_id = $1
     RETURNING *`,
    [clientId, day]
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS DERIVADOS — montam o "estado" pra a UI
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Monta o snapshot completo do que o cliente deveria ver agora.
 * Usado pela API /api/onboarding/current-stage.
 *
 * REGRA DE OURO:
 * O cliente SEMPRE vê a primeira etapa pendente cujo `day_release <= dia atual`.
 * Isso significa que se ele está no dia 5 e ainda não respondeu a etapa 1,
 * ele continua vendo a etapa 1 — não perde o acesso. Só quando responder a 1
 * ele sobe para a 2, e assim por diante. Esse é o "catch-up" mode.
 *
 * Consequência: dias de descanso (4, 8, 13) SÓ são mostrados se o cliente
 * estiver em dia com todas as etapas anteriores. Se ele tá no dia 4 mas não
 * respondeu a 3, ele vê a 3 — não vê descanso.
 *
 * Estados possíveis no retorno:
 *   - 'not_started'   → onboarding criado mas não ativado
 *   - 'rest_day'      → dia atual é de descanso E tudo anterior tá respondido
 *   - 'stage_ready'   → tem etapa pendente pra responder (pode ser de dias passados)
 *   - 'stage_done'    → todas as etapas liberadas já foram respondidas
 *                       (aguarda a próxima liberar amanhã)
 *   - 'completed'     → respondeu as 12 etapas
 *   - 'waiting_next'  → caso de borda (não deveria acontecer)
 */
export async function buildClientStageSnapshot(progress) {
  if (!progress) return { state: 'not_found' };
  if (progress.status === 'not_started') return { state: 'not_started' };
  if (progress.status === 'completed')   return { state: 'completed' };

  const currentDay = computeCurrentDay(progress.started_at);

  // Busca TODAS as respostas submitidas do cliente (uma query só)
  const submittedRows = await query(
    `SELECT stage_number FROM onboarding_stage_responses
     WHERE client_id = $1 AND submitted = true`,
    [progress.client_id]
  );
  const submittedStages = new Set(submittedRows.map(r => r.stage_number));

  // Se todas as 12 etapas já foram respondidas → completed
  if (submittedStages.size >= ONBOARDING_STAGES.length) {
    return { state: 'completed' };
  }

  // Encontra a PRIMEIRA etapa pendente cujo day_release <= currentDay
  // (modo "catch-up": se o cliente atrasou, ele pega de onde parou)
  const pendingStage = ONBOARDING_STAGES.find(
    s => s.day <= currentDay && !submittedStages.has(s.stage)
  );

  // Não tem nenhuma etapa pendente → todas liberadas até hoje já foram respondidas
  if (!pendingStage) {
    // Passou do fim do calendário?
    if (currentDay > TOTAL_DAYS) {
      return { state: 'completed' };
    }

    // Hoje é dia de descanso? (só mostra descanso se tudo anterior foi respondido)
    if (REST_DAY_NUMBERS.includes(currentDay)) {
      return { state: 'rest_day', day: currentDay, message: REST_DAYS[currentDay] };
    }

    // Entre etapas — aguarda a próxima liberar amanhã
    return { state: 'waiting_next', day: currentDay };
  }

  // Carrega a resposta existente dessa etapa (pode ter rascunho, só não foi submetida)
  const response = await getStageResponse(progress.client_id, pendingStage.stage);

  return {
    state: 'stage_ready',
    day: currentDay,           // dia atual do calendário (pra exibir "você tá no dia X")
    stageDay: pendingStage.day, // dia em que a etapa foi liberada (pra exibir "etapa do dia X")
    stage: pendingStage,
    response: response || null,
    nextStage: getNextStageAfter(pendingStage.stage),
  };
}

/**
 * Monta um "preview" enxuto da próxima etapa pra usar no card de teaser.
 * Retorna null se for a última.
 */
export function getNextStageTeaser(currentStageNumber) {
  const next = getNextStageAfter(currentStageNumber);
  if (!next) return null;
  return {
    stage: next.stage,
    title: next.title,
    description: next.description,
    timeEstimate: next.timeEstimate,
    questionCount: countQuestions(next),
  };
}
