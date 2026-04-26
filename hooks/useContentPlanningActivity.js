/**
 * hooks/useContentPlanningActivity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Polling de /api/content-planning/activity a cada 60s. Pausa quando a aba
 * fica oculta (visibilitychange) e retoma ao voltar.
 *
 * API: { activities, unreadCount, loading, refresh, markAsRead, markAllAsRead }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL_MS = 60_000;

export function useContentPlanningActivity({ enabled = true, limit = 20 } = {}) {
  const [activities, setActivities] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);
  const enabledRef = useRef(enabled);

  enabledRef.current = enabled;

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/content-planning/activity?limit=${limit}`);
      const d = await r.json();
      if (d.success) {
        setActivities(d.activities || []);
        setUnreadCount(d.unreadCount || 0);
      }
    } catch (e) {
      // silencioso — o polling tenta de novo
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const markAsRead = useCallback(async (id) => {
    if (!id) return;
    setActivities(prev => prev.filter(a => a.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/content-planning/activity/${id}/read`, { method: 'PUT' });
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    setActivities([]);
    setUnreadCount(0);
    try {
      await fetch('/api/content-planning/activity', { method: 'PUT' });
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    function start() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    }
    function stop() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    function onVisibility() {
      if (document.hidden) stop();
      else { refresh(); start(); }
    }

    refresh();
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, refresh]);

  return { activities, unreadCount, loading, refresh, markAsRead, markAllAsRead };
}

export default useContentPlanningActivity;
