const { query, queryOne } = require('../infra/db');
const cache = require('../infra/cache');

/**
 * Extrai menções (@username) do conteúdo.
 */
function extractMentions(content) {
  const matches = content.match(/@(\w+)/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1)); // remove o @
}

/**
 * Adiciona comentário a uma task, resolve menções, notifica usuários.
 */
async function addComment(taskId, authorId, content, tenantId) {
  const usernames = extractMentions(content);

  // Busca nome do autor para a mensagem de notificação
  const author = await queryOne('SELECT name FROM tenants WHERE id = $1', [authorId]);
  const authorName = author ? author.name : 'Alguém';

  // Resolve menções: busca IDs dos usuários mencionados (excluindo o autor)
  const mentionedUsers = [];
  for (const username of usernames) {
    const user = await queryOne(
      'SELECT id, name FROM tenants WHERE username = $1 AND id != $2',
      [username, authorId]
    );
    if (user) mentionedUsers.push(user);
  }

  const mentionIds = mentionedUsers.map(u => u.id);

  // Insere o comentário
  const comment = await queryOne(
    `INSERT INTO task_comments (task_id, tenant_id, author_id, content, mentions)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [taskId, tenantId, authorId, content, mentionIds]
  );

  // Notifica cada usuário mencionado
  for (const user of mentionedUsers) {
    await query(
      `INSERT INTO system_notifications (tenant_id, type, title, message, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        'task_mention',
        'Mencionado em comentário',
        `Você foi mencionado na task por ${authorName}`,
        JSON.stringify({ taskId, commentId: comment.id })
      ]
    );

    cache.invalidate('notif:count:' + user.id);
  }

  // Registra atividade
  await query(
    `INSERT INTO task_activity_log (action, actor_id, task_id, tenant_id)
     VALUES ($1, $2, $3, $4)`,
    ['comment_added', authorId, taskId, tenantId]
  );

  return comment;
}

/**
 * Lista comentários de uma task com dados do autor.
 */
async function getComments(taskId, tenantId) {
  return query(
    `SELECT tc.*, t.name AS author_name, t.avatar_url AS author_avatar
     FROM task_comments tc
     LEFT JOIN tenants t ON t.id = tc.author_id
     WHERE tc.task_id = $1 AND tc.tenant_id = $2
     ORDER BY tc.created_at ASC`,
    [taskId, tenantId]
  );
}

/**
 * Remove comentário (somente o autor pode deletar).
 */
async function deleteComment(id, authorId, tenantId) {
  return queryOne(
    'DELETE FROM task_comments WHERE id = $1 AND author_id = $2 AND tenant_id = $3 RETURNING id',
    [id, authorId, tenantId]
  );
}

module.exports = { addComment, getComments, deleteComment };
