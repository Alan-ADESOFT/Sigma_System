/**
 * hooks/useContentPlan.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Carrega um plano por id (incluindo criativos) e expoe refresh + setPlan
 * para mutacoes otimistas. Toasts em erro via NotificationContext.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';

export function useContentPlan(planId) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useNotification();

  const refresh = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/content-planning/plans/${planId}`);
      const d = await r.json();
      if (d.success) setPlan(d.plan);
      else notify(d.error || 'Erro ao carregar plano', 'error');
    } catch (e) {
      notify('Falha de rede ao carregar plano', 'error');
    } finally {
      setLoading(false);
    }
  }, [planId, notify]);

  useEffect(() => { refresh(); }, [refresh]);

  return { plan, loading, refresh, setPlan };
}

export default useContentPlan;
