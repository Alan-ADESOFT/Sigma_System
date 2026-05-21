/**
 * pages/api/onboarding/day-snapshot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoint público — token na URL controla acesso (sem login).
 *
 * GET /api/onboarding/day-snapshot?token={token}
 *   → Lista os 15 dias com status agregado. Usado pra alimentar o
 *     OnboardingDayNavigator no canto superior direito da página.
 *     Cache HTTP de 60s (private) — bata-com o navegador sem ir no banco.
 *
 * GET /api/onboarding/day-snapshot?token={token}&day=N
 *   → Detalhe do dia N. Para dias passados respondidos vem `readOnly: true`
 *     (cliente vê as próprias respostas). Para dias futuros vem
 *     `state: 'locked'` (UI mostra cadeado + data de liberação).
 *
 * Privacidade: o token É a chave. Só retorna dados do progress que esse token
 * resolve — nunca outro cliente. Token expirado = 410.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  getProgressByToken,
  buildDayList,
  buildDayDetail,
} from '../../../models/onboarding';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { token, day } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token obrigatório' });
  }

  try {
    console.log('[INFO][API:onboarding/day-snapshot]', {
      token: String(token).slice(0, 8) + '...',
      day: day || 'list',
    });

    const progress = await getProgressByToken(token);
    if (!progress) {
      return res.status(404).json({ success: false, state: 'not_found' });
    }
    if (progress.token_expires && new Date(progress.token_expires) < new Date()) {
      return res.status(410).json({ success: false, state: 'expired' });
    }
    if (progress.status === 'not_started') {
      // Sem started_at → nem montar lista faz sentido
      return res.json({ success: true, state: 'not_started' });
    }

    // ── Modo lista (sem day) ──
    if (!day) {
      const data = await buildDayList(progress);
      // 60s cache privado — apenas o navegador do cliente. Pós-submit, o front
      // chama com cache:'no-store' pra invalidar.
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json({
        success: true,
        currentDay: data.currentDay,
        totalDays: data.totalDays,
        days: data.days,
      });
    }

    // ── Modo detalhe (com day=N) ──
    const detail = await buildDayDetail(progress, day);
    return res.json({
      success: true,
      client: {
        company_name: progress.company_name,
        responsible_name: progress.responsible_name,
        onboarding_greeting_with: progress.onboarding_greeting_with,
      },
      ...detail,
    });
  } catch (err) {
    console.error('[ERRO][API:onboarding/day-snapshot]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
