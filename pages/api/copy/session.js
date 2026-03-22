/**
 * @fileoverview Endpoint: Sessoes de copy (workspace)
 * @route GET    /api/copy/session?folderId=xxx&clientId=yyy → busca/cria sessoes da pasta
 * @route PUT    /api/copy/session?sessionId=xxx             → atualiza campos da sessao
 * @route POST   /api/copy/session                           → cria novo chat na pasta
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { query } from '../../../infra/db';
import { getOrCreateSession, createChat, updateSession, deleteSession, getHistory, getStructures } from '../../../models/copy/copySession';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    // ── GET: busca/cria sessoes com dados complementares ──
    if (req.method === 'GET') {
      const folderId = req.query.folderId || req.query.contentId; // compatibilidade
      const clientId = req.query.clientId || null;
      if (!folderId) return res.status(400).json({ success: false, error: 'folderId e obrigatorio' });

      const activeId = req.query.activeId || null; // Chat especifico para carregar historico
      console.log('[INFO][API:copy/session] GET sessoes', { folderId, clientId, activeId, tenantId });

      const { sessions, active } = await getOrCreateSession(folderId, tenantId, clientId);
      const structures = await getStructures(tenantId);

      // Se activeId especificado, carrega historico dele; senao do ultimo chat
      const historyTarget = activeId ? sessions.find(s => s.id === activeId) : active;
      const history = historyTarget ? await getHistory(historyTarget.id, 10) : [];

      return res.json({
        success: true,
        data: { sessions, active: historyTarget || active, structures, history },
      });
    }

    // ── POST: cria novo chat na pasta ──
    if (req.method === 'POST') {
      const { folderId, clientId, title } = req.body;
      if (!folderId) return res.status(400).json({ success: false, error: 'folderId e obrigatorio' });

      console.log('[INFO][API:copy/session] POST novo chat', { folderId, clientId });

      const session = await createChat(folderId, tenantId, clientId, title);
      return res.status(201).json({ success: true, data: session });
    }

    // ── PUT: atualiza campos da sessao ──
    if (req.method === 'PUT') {
      const { sessionId } = req.query;
      if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId e obrigatorio' });

      console.log('[INFO][API:copy/session] PUT sessao', { sessionId });

      const updated = await updateSession(sessionId, req.body);
      if (!updated) return res.status(404).json({ success: false, error: 'Sessao nao encontrada' });

      return res.json({ success: true, data: updated });
    }

    // ── DELETE: apaga uma sessao ──
    if (req.method === 'DELETE') {
      const { sessionId } = req.query;
      if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId e obrigatorio' });

      console.log('[INFO][API:copy/session] DELETE sessao', { sessionId });

      const deleted = await deleteSession(sessionId);
      if (!deleted) return res.status(404).json({ success: false, error: 'Sessao nao encontrada' });

      return res.json({ success: true, data: deleted });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:copy/session]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
