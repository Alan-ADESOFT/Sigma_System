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

/**
 * Cria uma notificação interna no sistema.
 * Usada para avisar operadores sobre eventos (form preenchido, token expirado, etc.)
 */
async function createNotification(tenantId, type, title, message, clientId = null, metadata = {}) {
  console.log('[INFO][ClientForm:createNotification] Criando notificação', { tenantId, type, clientId });

  const row = await queryOne(
    `INSERT INTO system_notifications (tenant_id, type, title, message, client_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, type, title, message, clientId, JSON.stringify(metadata)]
  );

  console.log('[SUCESSO][ClientForm:createNotification] Notificação criada', { id: row.id, type });
  return row;
}

/**
 * Busca notificações não lidas do tenant com nome do cliente.
 * Ordenadas da mais recente para a mais antiga.
 */
async function getUnreadNotifications(tenantId, limit = 20) {
  console.log('[INFO][ClientForm:getUnreadNotifications] Buscando notificações', { tenantId });

  return query(
    `SELECT n.*, c.company_name
     FROM system_notifications n
     LEFT JOIN marketing_clients c ON c.id = n.client_id
     WHERE n.tenant_id = $1 AND n.read = false
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
}

/**
 * Marca uma notificação específica como lida.
 */
async function markNotificationRead(notificationId) {
  console.log('[INFO][ClientForm:markNotificationRead] Marcando como lida', { notificationId });

  return queryOne(
    `UPDATE system_notifications SET read = true WHERE id = $1 RETURNING *`,
    [notificationId]
  );
}

/**
 * Marca todas as notificações do tenant como lidas de uma vez.
 */
async function markAllNotificationsRead(tenantId) {
  console.log('[INFO][ClientForm:markAllNotificationsRead] Marcando todas como lidas', { tenantId });

  return query(
    `UPDATE system_notifications SET read = true WHERE tenant_id = $1 AND read = false RETURNING id`,
    [tenantId]
  );
}

/**
 * Busca todas as notificações do tenant (lidas e não lidas).
 * Usada na aba "Todas" do dropdown de notificações.
 */
async function getAllNotifications(tenantId, limit = 50) {
  console.log('[INFO][ClientForm:getAllNotifications] Buscando todas as notificações', { tenantId });

  return query(
    `SELECT n.*, c.company_name
     FROM system_notifications n
     LEFT JOIN marketing_clients c ON c.id = n.client_id
     WHERE n.tenant_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
}

/**
 * Conta quantas notificações não lidas o tenant tem — usado para badge no header.
 */
async function countUnread(tenantId) {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS count FROM system_notifications WHERE tenant_id = $1 AND read = false`,
    [tenantId]
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
  getUnreadNotifications,
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  countUnread,
};
