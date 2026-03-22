/**
 * pages/api/notifications/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Notificações internas do sistema.
 * GET  — Retorna notificações não lidas + contagem
 * POST — Marca uma ou todas como lidas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import {
  getUnreadNotifications,
  getAllNotifications,
  countUnread,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../../models/clientForm';

export default async function handler(req, res) {
  console.log('[INFO][API:/api/notifications] Requisição recebida', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);

    // ── GET: listar notificações ──
    if (req.method === 'GET') {
      const filter = req.query.filter || 'unread';

      const [notifications, unreadCount] = await Promise.all([
        filter === 'all' ? getAllNotifications(tenantId) : getUnreadNotifications(tenantId),
        countUnread(tenantId),
      ]);

      console.log('[SUCESSO][API:/api/notifications] Notificações retornadas', { filter, count: notifications.length, unreadCount });
      return res.json({ success: true, notifications, unreadCount });
    }

    // ── POST: marcar como lida ──
    if (req.method === 'POST') {
      const { action, id } = req.body;

      if (action !== 'markRead') {
        return res.status(400).json({ success: false, error: 'Ação inválida. Use action: "markRead"' });
      }

      if (id) {
        // Marca uma notificação específica
        await markNotificationRead(id);
        console.log('[SUCESSO][API:/api/notifications] Notificação marcada como lida', { id });
      } else {
        // Marca todas do tenant
        await markAllNotificationsRead(tenantId);
        console.log('[SUCESSO][API:/api/notifications] Todas as notificações marcadas como lidas', { tenantId });
      }

      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/notifications] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
