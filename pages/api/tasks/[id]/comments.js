const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { verifyToken } = require('../../../../lib/auth');
const commentModel = require('../../../../models/taskComment.model');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: taskId } = req.query;
  const token = req.cookies?.sigma_token;
  const session = verifyToken(token);
  const userId = session?.userId;

  try {
    if (req.method === 'GET') {
      const comments = await commentModel.getComments(taskId, tenantId);
      return res.json({ success: true, comments });
    }

    if (req.method === 'POST') {
      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: 'Conteúdo obrigatório' });
      }
      const comment = await commentModel.addComment(taskId, userId, content.trim(), tenantId);
      return res.status(201).json({ success: true, comment });
    }

    if (req.method === 'DELETE') {
      const { commentId } = req.body;
      if (!commentId) return res.status(400).json({ success: false, error: 'commentId obrigatório' });
      const deleted = await commentModel.deleteComment(commentId, userId, tenantId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Comentário não encontrado' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/tasks/[id]/comments]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
