/**
 * pages/api/support/media/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/support/media — registra mídia (vídeo ou anexo) numa aula
 *
 * O upload físico já aconteceu via /api/upload (que devolveu url+metadados).
 * Este endpoint só persiste o registro no banco. Admin/god only.
 *
 * Valida que a lesson pertence ao tenant — defesa em profundidade contra
 * caller forjando lessonId de outro workspace.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../../infra/get-tenant-id');
const { requireAuth, isAdmin } = require('../../../../lib/api-auth');
const supportModel = require('../../../../models/support.model');

export default async function handler(req, res) {
  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Método não permitido' });
    }
    if (!isAdmin(user)) {
      return res.status(403).json({ success: false, error: 'Apenas admin pode adicionar mídia' });
    }

    const {
      lessonId, kind, title, description,
      file_url, file_name, file_size_bytes, mime_type, sort_order,
    } = req.body || {};

    if (!lessonId) return res.status(400).json({ success: false, error: 'lessonId obrigatório' });
    if (!file_url) return res.status(400).json({ success: false, error: 'file_url obrigatório' });
    if (kind !== 'video' && kind !== 'attachment') {
      return res.status(400).json({ success: false, error: "kind deve ser 'video' ou 'attachment'" });
    }

    const owns = await supportModel.isLessonOfTenant(lessonId, tenantId);
    if (!owns) {
      return res.status(404).json({ success: false, error: 'Aula não encontrada' });
    }

    const created = await supportModel.createMedia(
      {
        lesson_id: lessonId,
        kind,
        title,
        description,
        file_url,
        file_name,
        file_size_bytes,
        mime_type,
        sort_order,
      },
      tenantId,
      user.id
    );
    console.log('[SUCESSO][API:support/media] criada', { id: created.id, lessonId, kind, by: user.id });
    return res.status(201).json({ success: true, media: created });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:support/media]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
