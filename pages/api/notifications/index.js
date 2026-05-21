/**
 * pages/api/notifications/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Notificações internas do sistema (sininho do header).
 *
 * PATCH single-workspace (20260521):
 *   • Filtra por user_id do logado — só vê notificação dele + broadcasts.
 *   • Cache key inclui userId pra não vazar contagem entre usuários.
 *
 * GET  — Retorna notificações visíveis pro user logado + contagem
 * POST — { action: 'markRead', id? } — marca uma ou todas como lidas
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
import { getOrSet, invalidate } from '../../../infra/cache';

const { requireAuth } = require('../../../lib/api-auth');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/notifications] Requisição recebida', { method: req.method });

  try {
    const user = await requireAuth(req);
    const tenantId = await resolveTenantId(req);

    // ── GET: listar notificações visíveis pro user ──
    if (req.method === 'GET') {
      const filter = req.query.filter || 'unread';

      const [notifications, unreadCount] = await Promise.all([
        filter === 'all'
          ? getAllNotifications(tenantId, user.id)
          : getUnreadNotifications(tenantId, user.id),
        // Cache PESSOAL — chave inclui userId pra cada user ter seu próprio
        // contador. Senão o badge poderia mostrar contagem alheia.
        getOrSet(
          `notif:count:${tenantId}:${user.id}`,
          () => countUnread(tenantId, user.id),
          30
        ),
      ]);

      console.log('[SUCESSO][API:/api/notifications]', {
        filter, count: notifications.length, unreadCount, userId: user.id,
      });
      return res.json({ success: true, notifications, unreadCount });
    }

    // ── POST: marcar como lida ──
    if (req.method === 'POST') {
      const { action, id } = req.body || {};

      if (action !== 'markRead') {
        return res.status(400).json({ success: false, error: 'Ação inválida. Use action: "markRead"' });
      }

      if (id) {
        await markNotificationRead(id);
        console.log('[SUCESSO][API:/api/notifications] notificação marcada', { id, userId: user.id });
      } else {
        await markAllNotificationsRead(tenantId, user.id);
        console.log('[SUCESSO][API:/api/notifications] todas marcadas como lidas', { userId: user.id });
      }

      // Invalida só a chave pessoal — o cache de outros users continua válido.
      invalidate(`notif:count:${tenantId}:${user.id}`);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    console.error('[ERRO][API:/api/notifications]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
