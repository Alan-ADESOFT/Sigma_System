/**
 * models/clientForm.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Model centralizado para o sistema de formulário do cliente.
 * Gerencia tokens de acesso, rascunhos, submissões e notificações internas.
 *
 * Tabelas: client_form_tokens, client_form_responses, system_notifications
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');
const crypto = require('crypto');

// ─── TOKENS ──────────────────────────────────────────────────────────────────

/**
 * Gera um token único para o cliente acessar o formulário público.
 * Invalida todos os tokens pendentes anteriores do mesmo cliente
 * antes de criar o novo — um cliente só pode ter um token ativo por vez.
 */
async function generateFormToken(tenantId, clientId) {
  console.log('[INFO][ClientForm:generateFormToken] Gerando token', { tenantId, clientId });

  // Invalida tokens pendentes anteriores deste cliente
  const expired = await query(
    `UPDATE client_form_tokens
     SET status = 'expired', updated_at = now()
     WHERE client_id = $1 AND status = 'pending'
     RETURNING id`,
    [clientId]
  );
  if (expired.length > 0) {
    console.log('[INFO][ClientForm:generateFormToken] Tokens anteriores invalidados', { count: expired.length });
  }

  const token = crypto.randomUUID();
  const row = await queryOne(
    `INSERT INTO client_form_tokens (tenant_id, client_id, token, expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days')
     RETURNING *`,
    [tenantId, clientId, token]
  );

  console.log('[SUCESSO][ClientForm:generateFormToken] Token gerado', { tokenId: row.id, clientId });
  return row;
}

/**
 * Busca um token pelo seu valor raw (não pelo id interno).
 * Faz JOIN com marketing_clients para retornar dados do cliente junto.
 */
async function getTokenByValue(tokenValue) {
  console.log('[INFO][ClientForm:getTokenByValue] Buscando token');

  return queryOne(
    `SELECT t.*, c.company_name, c.phone, c.email, c.tenant_id AS client_tenant_id
     FROM client_form_tokens t
     JOIN marketing_clients c ON c.id = t.client_id
     WHERE t.token = $1`,
    [tokenValue]
  );
}

/**
 * Valida um token: verifica existência, status e expiração.
 * Retorna { valid, reason, tokenData } para o chamador decidir o que fazer.
 */
async function validateToken(tokenValue) {
  console.log('[INFO][ClientForm:validateToken] Validando token');

  const tokenData = await getTokenByValue(tokenValue);

  if (!tokenData) {
    console.log('[INFO][ClientForm:validateToken] Token não encontrado');
    return { valid: false, reason: 'not_found', tokenData: null };
  }

  if (tokenData.status === 'used') {
    console.log('[INFO][ClientForm:validateToken] Token já utilizado', { tokenId: tokenData.id });
    return { valid: false, reason: 'already_used', tokenData };
  }

  if (tokenData.status === 'expired' || new Date(tokenData.expires_at) <= new Date()) {
    console.log('[INFO][ClientForm:validateToken] Token expirado', { tokenId: tokenData.id });
    return { valid: false, reason: 'expired', tokenData };
  }

  // in_progress = alguém já começou a preencher
  if (tokenData.status === 'in_progress') {
    console.log('[INFO][ClientForm:validateToken] Token em andamento', { tokenId: tokenData.id });
    return { valid: false, reason: 'in_progress', tokenData };
  }

  console.log('[SUCESSO][ClientForm:validateToken] Token válido', { tokenId: tokenData.id });
  return { valid: true, reason: 'valid', tokenData };
}

/**
 * Marca o token como utilizado — chamado após o cliente submeter o form.
 */
async function markTokenAsUsed(tokenId) {
  console.log('[INFO][ClientForm:markTokenAsUsed] Marcando token como usado', { tokenId });

  return queryOne(
    `UPDATE client_form_tokens
     SET status = 'used', used_at = now()
     WHERE id = $1
     RETURNING *`,
    [tokenId]
  );
}

/**
 * Consulta o status do formulário de um cliente.
 * Lógica simples: form_done no marketing_clients é a fonte de verdade.
 * Token serve apenas para controle de acesso na página pública.
 */
async function getFormStatusForClient(clientId) {
  console.log('[INFO][ClientForm:getFormStatusForClient] Consultando status do formulário', { clientId });

  // PRIORIDADE 1: onboarding de 15 dias (novo sistema)
  // Se o cliente tem um onboarding_progress ativo ou concluído, esse é o
  // estado real — ignoramos client_form_tokens (formulário antigo).
  const onboarding = await queryOne(
    `SELECT op.*,
            (SELECT COUNT(*)::int FROM onboarding_stage_responses osr
             WHERE osr.client_id = op.client_id AND osr.submitted = true) AS stages_submitted
     FROM onboarding_progress op
     WHERE op.client_id = $1`,
    [clientId]
  );

  if (onboarding && onboarding.status !== 'not_started') {
    return {
      formStatus: 'onboarding_' + onboarding.status, // 'onboarding_active' | 'onboarding_completed' | 'onboarding_paused'
      onboarding: {
        token: onboarding.token,
        status: onboarding.status,
        startedAt: onboarding.started_at,
        completedAt: onboarding.completed_at,
        currentStage: onboarding.current_stage,
        currentDay: onboarding.current_day,
        stagesSubmitted: onboarding.stages_submitted || 0,
        totalStages: 12,
      },
    };
  }

  // PRIORIDADE 2: formulário antigo (retrocompatibilidade)
  // Verifica se o cliente tem form_done = true
  const client = await queryOne(
    `SELECT form_done FROM marketing_clients WHERE id = $1`,
    [clientId]
  );

  if (client?.form_done) {
    // Busca as respostas submetidas
    const response = await queryOne(
      `SELECT r.* FROM client_form_responses r
       JOIN client_form_tokens t ON t.id = r.token_id
       WHERE t.client_id = $1 AND r.status = 'submitted'
       ORDER BY r.submitted_at DESC LIMIT 1`,
      [clientId]
    );

    return {
      formStatus: 'submitted',
      draft: response ? {
        data: response.data,
        currentStep: response.current_step,
        status: response.status,
        submittedAt: response.submitted_at,
      } : null,
    };
  }

  // Verifica se existe um token ativo (link enviado mas não respondido)
  const token = await queryOne(
    `SELECT * FROM client_form_tokens
     WHERE client_id = $1 AND status IN ('pending', 'in_progress')
     ORDER BY created_at DESC LIMIT 1`,
    [clientId]
  );

  if (!token) {
    return { formStatus: 'not_sent' };
  }

  // Verifica se expirou
  if (new Date(token.expires_at) <= new Date()) {
    return { formStatus: 'expired', token: { expiresAt: token.expires_at } };
  }

  // Verifica se tem rascunho em andamento
  const draft = await queryOne(
    `SELECT * FROM client_form_responses WHERE token_id = $1`,
    [token.id]
  );

  if (draft) {
    return {
      formStatus: 'draft',
      token: { expiresAt: token.expires_at },
      draft: { currentStep: draft.current_step, data: draft.data },
    };
  }

  return { formStatus: 'sent', token: { expiresAt: token.expires_at } };
}

/**
 * Expira manualmente um token (ex: operador cancelou o envio).
 */
async function expireToken(tokenId) {
  console.log('[INFO][ClientForm:expireToken] Expirando token', { tokenId });

  return queryOne(
    `UPDATE client_form_tokens
     SET status = 'expired'
     WHERE id = $1
     RETURNING *`,
    [tokenId]
  );
}

// ─── RASCUNHO / RESPOSTAS ────────────────────────────────────────────────────

/**
 * Salva ou atualiza rascunho das respostas do formulário.
 * Usa INSERT ... ON CONFLICT para upsert — cada token tem no máximo uma response.
 */
async function upsertDraft(tokenId, clientId, tenantId, data, currentStep) {
  console.log('[INFO][ClientForm:upsertDraft] Salvando rascunho', { tokenId, currentStep });

  const row = await queryOne(
    `INSERT INTO client_form_responses (token_id, client_id, tenant_id, data, current_step)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token_id) DO UPDATE SET
       data         = $4,
       current_step = $5,
       updated_at   = now()
     RETURNING *`,
    [tokenId, clientId, tenantId, JSON.stringify(data), currentStep]
  );

  console.log('[SUCESSO][ClientForm:upsertDraft] Rascunho salvo', { responseId: row.id });
  return row;
}

/**
 * Busca o rascunho existente de um token — retorna null se nunca salvou.
 */
async function getDraft(tokenId) {
  console.log('[INFO][ClientForm:getDraft] Buscando rascunho', { tokenId });

  return queryOne(
    `SELECT * FROM client_form_responses WHERE token_id = $1`,
    [tokenId]
  );
}

/**
 * Submissão final do formulário.
 * Salva os dados finais, muda status para 'submitted' e marca o token como usado.
 */
async function submitForm(tokenId, clientId, tenantId, data) {
  console.log('[INFO][ClientForm:submitForm] Submetendo formulário', { tokenId, clientId });

  // Salva/atualiza os dados finais
  await upsertDraft(tokenId, clientId, tenantId, data, 11);

  // Marca a response como submitted
  const row = await queryOne(
    `UPDATE client_form_responses
     SET status = 'submitted', submitted_at = now(), updated_at = now()
     WHERE token_id = $1
     RETURNING *`,
    [tokenId]
  );

  // Marca o token como usado
  await markTokenAsUsed(tokenId);

  console.log('[SUCESSO][ClientForm:submitForm] Formulário submetido', { responseId: row.id, clientId });
  return row;
}

// ─── NOTIFICAÇÕES ────────────────────────────────────────────────────────────
//
// PATCH single-workspace (20260521):
//
// Em modo single-workspace, `tenant_id` é o MESMO pra todos os usuários do
// time. Filtrar só por tenant_id no sininho faria todo mundo ver notificação
// de todo mundo — o que está errado pra notificações pessoais.
//
// Solução adotada:
//   • Cada notificação tem `user_id`:
//       - user_id = NULL  → broadcast (todo time vê).
//       - user_id = $X    → pessoal (só $X vê).
//   • As funções de leitura filtram pelo destinatário:
//       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
//     O `OR user_id IS NULL` garante que broadcasts continuam visíveis pra
//     todo mundo, e que notificações antigas (sem user_id) viram broadcast
//     retroativo.
//   • createNotification aceita o destinatário como 2º parâmetro opcional.
//     A função paralela createUserNotification deixa explícito quando a
//     intenção é "pessoal" (force userId obrigatório).
//   • O cache do badge é por usuário: chave `notif:count:${tenant}:${user}`.
//
// Regra de bolso pra call sites:
//   - Notificação RESULTADO DE AÇÃO DO USER ou ENDEREÇADA A UM USER  → pessoal
//   - Evento do sistema relevante pra todo time (cliente preencheu form,
//     pipeline rodou, base apagada, etc.)                            → broadcast
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma notificação interna no sistema.
 *
 * Assinatura mantida retrocompatível com chamadas antigas
 * (`createNotification(tenantId, type, title, message, clientId, metadata)`),
 * que ficam como **broadcast** (todo time vê).
 *
 * Para notificação pessoal, passe `userId` como 7º parâmetro OU use a função
 * `createUserNotification(userId, ...)` que torna a intenção explícita.
 *
 * @param {string}      tenantId  - workspace global (resolveTenantId)
 * @param {string}      type      - chave do tipo (ex: 'task_assigned')
 * @param {string}      title
 * @param {string}      message
 * @param {string|null} clientId  - cliente relacionado (opcional)
 * @param {object}      metadata
 * @param {string|null} userId    - destinatário pessoal. NULL/undefined = broadcast.
 */
async function createNotification(tenantId, type, title, message, clientId = null, metadata = {}, userId = null) {
  console.log('[INFO][ClientForm:createNotification]', {
    tenantId, userId: userId || '(broadcast)', type, clientId,
  });

  const row = await queryOne(
    `INSERT INTO system_notifications (tenant_id, user_id, type, title, message, client_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, userId || null, type, title, message, clientId, JSON.stringify(metadata)]
  );

  // PERF: invalida cache de contagem. Em broadcast, invalida o prefixo do
  // tenant inteiro (cobre todos os users daquele tenant).
  try {
    const { invalidate } = require('../infra/cache');
    if (userId) {
      invalidate(`notif:count:${tenantId}:${userId}`);
    } else {
      invalidate(`notif:count:${tenantId}`);
    }
  } catch {}

  console.log('[SUCESSO][ClientForm:createNotification]', { id: row.id, type });
  return row;
}

/**
 * Atalho explícito quando a intenção é "pessoal" — `userId` obrigatório.
 * Use isso em call sites onde a notificação é claramente pra UM usuário
 * (ex: "task atribuída a você", "tarefas vencidas suas"). A ordem dos
 * parâmetros é DIFERENTE de `createNotification` (userId primeiro) pra forçar
 * o caller a pensar no destinatário antes do conteúdo.
 */
async function createUserNotification(userId, tenantId, type, title, message, clientId = null, metadata = {}) {
  if (!userId) throw new Error('createUserNotification: userId obrigatório (use createNotification para broadcast)');
  return createNotification(tenantId, type, title, message, clientId, metadata, userId);
}

/**
 * Notificações não-lidas DO USUÁRIO logado.
 * Cobre pessoais (user_id = $userId) E broadcasts (user_id IS NULL).
 *
 * @param {string} tenantId
 * @param {string} userId   - obrigatório
 * @param {number} limit
 */
async function getUnreadNotifications(tenantId, userId, limit = 20) {
  if (!userId) throw new Error('getUnreadNotifications: userId obrigatório');

  return query(
    `SELECT n.*, c.company_name
     FROM system_notifications n
     LEFT JOIN marketing_clients c ON c.id = n.client_id
     WHERE n.tenant_id = $1
       AND (n.user_id = $2 OR n.user_id IS NULL)
       AND n.read = false
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [tenantId, userId, limit]
  );
}

/**
 * Marca uma notificação específica como lida.
 *
 * Nota: NÃO valida que a notificação pertence ao caller — o sininho da UI
 * só lista o que é dele (pessoal + broadcast), então a chance de ID inválido
 * é baixa. Se quiser endurecer no futuro, adicionar `AND (user_id = $X OR user_id IS NULL)`.
 */
async function markNotificationRead(notificationId) {
  return queryOne(
    `UPDATE system_notifications SET read = true WHERE id = $1 RETURNING *`,
    [notificationId]
  );
}

/**
 * Marca como lidas todas as notificações VISÍVEIS PRO USUÁRIO logado.
 * "Visíveis" = pessoais (user_id = $userId) + broadcasts (user_id IS NULL).
 *
 * Importante: broadcasts são marcadas como lidas pra TODO MUNDO quando um
 * único user clica "marcar tudo como lido". Aceitável por ora — a maior parte
 * dos broadcasts é operacional (pipeline rodou, base apagada). Se isso virar
 * problema, criar uma tabela `notification_reads(user_id, notification_id)`.
 */
async function markAllNotificationsRead(tenantId, userId) {
  if (!userId) throw new Error('markAllNotificationsRead: userId obrigatório');

  return query(
    `UPDATE system_notifications
        SET read = true
      WHERE tenant_id = $1
        AND (user_id = $2 OR user_id IS NULL)
        AND read = false
      RETURNING id`,
    [tenantId, userId]
  );
}

/**
 * Todas as notificações visíveis pro user logado (lidas e não-lidas).
 */
async function getAllNotifications(tenantId, userId, limit = 50) {
  if (!userId) throw new Error('getAllNotifications: userId obrigatório');

  return query(
    `SELECT n.*, c.company_name
     FROM system_notifications n
     LEFT JOIN marketing_clients c ON c.id = n.client_id
     WHERE n.tenant_id = $1
       AND (n.user_id = $2 OR n.user_id IS NULL)
     ORDER BY n.created_at DESC
     LIMIT $3`,
    [tenantId, userId, limit]
  );
}

/**
 * Conta não-lidas visíveis pro user logado — usado pelo badge do sininho.
 */
async function countUnread(tenantId, userId) {
  if (!userId) throw new Error('countUnread: userId obrigatório');

  const row = await queryOne(
    `SELECT COUNT(*)::int AS count
       FROM system_notifications
      WHERE tenant_id = $1
        AND (user_id = $2 OR user_id IS NULL)
        AND read = false`,
    [tenantId, userId]
  );
  return row?.count || 0;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Tokens
  generateFormToken,
  getTokenByValue,
  validateToken,
  markTokenAsUsed,
  expireToken,
  getFormStatusForClient,
  // Rascunho / Respostas
  upsertDraft,
  getDraft,
  submitForm,
  // Notificações
  createNotification,
  createUserNotification,
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  countUnread,
};
