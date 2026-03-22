/**
 * hooks/useFormDraft.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook de rascunho duplo para o formulário público.
 * Layer A: localStorage (instantâneo, debounce 800ms)
 * Layer B: API /api/form/save-draft (ao trocar de etapa)
 *
 * O localStorage guarda os dados por 30 dias no dispositivo.
 * O servidor salva a cada troca de etapa como backup cross-device.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const DRAFT_EXPIRY_DAYS = 30;

function getDraftKey(token) {
  return `form_draft_${token}`;
}

/**
 * Carrega rascunho do localStorage. Retorna null se não existir ou expirou.
 */
function loadLocalDraft(token) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getDraftKey(token));
    if (!raw) return null;

    const draft = JSON.parse(raw);

    // Verifica expiração (30 dias)
    if (draft.expiresAt && new Date(draft.expiresAt) <= new Date()) {
      console.log('[FORM] Rascunho local expirado, removendo');
      localStorage.removeItem(getDraftKey(token));
      return null;
    }

    return draft;
  } catch (err) {
    console.error('[FORM] Erro ao ler rascunho local', err);
    return null;
  }
}

/**
 * Salva rascunho no localStorage com timestamp e expiração de 30 dias.
 */
function saveLocalDraft(token, data, currentStep) {
  if (typeof window === 'undefined') return;

  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const draft = {
      data,
      currentStep,
      savedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    localStorage.setItem(getDraftKey(token), JSON.stringify(draft));
    console.log('[FORM] Rascunho local salvo', { currentStep });
  } catch (err) {
    console.error('[FORM] Erro ao salvar rascunho local', err);
  }
}

/**
 * Salva rascunho no servidor via API. Não bloqueia — falha silenciosa.
 */
async function saveServerDraft(token, data, currentStep) {
  try {
    const res = await fetch('/api/form/save-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, data, currentStep }),
    });
    const result = await res.json();

    if (result.success) {
      console.log('[FORM] Rascunho salvo no servidor', { savedAt: result.savedAt });
      return true;
    } else {
      console.warn('[FORM] Servidor recusou rascunho', result);
      return false;
    }
  } catch (err) {
    // Falha silenciosa — não bloqueia o usuário
    console.warn('[FORM] Falha ao salvar rascunho no servidor', err.message);
    return false;
  }
}

/**
 * Decide qual rascunho usar: local ou servidor (o mais recente vence).
 */
function resolveDraft(localDraft, serverDraft) {
  if (!localDraft && !serverDraft) return null;
  if (!localDraft) return { source: 'server', ...serverDraft };
  if (!serverDraft) return { source: 'local', ...localDraft };

  // Ambos existem — compara datas e usa o mais recente
  const localDate = new Date(localDraft.savedAt);
  const serverDate = new Date(serverDraft.updatedAt || serverDraft.savedAt || 0);

  if (serverDate > localDate) {
    console.log('[FORM] Rascunho do servidor é mais recente');
    return { source: 'server', data: serverDraft.data, currentStep: serverDraft.currentStep, savedAt: serverDate.toISOString() };
  }

  console.log('[FORM] Rascunho local é mais recente');
  return { source: 'local', ...localDraft };
}

/* ═══════════════════════════════════════════════════════════
   HOOK PRINCIPAL
═══════════════════════════════════════════════════════════ */

export function useFormDraft(token, serverDraft) {
  // Rascunho resolvido para restauração
  const [pendingDraft, setPendingDraft] = useState(null);
  const [showDraftRestore, setShowDraftRestore] = useState(false);

  // Indicador "✓ Salvo" no canto do card
  const [showSaved, setShowSaved] = useState(false);

  // Debounce ref para salvar no localStorage
  const debounceRef = useRef(null);

  /* ── Verifica se existe rascunho ao montar ── */
  useEffect(() => {
    if (!token) return;

    const localDraft = loadLocalDraft(token);
    const resolved = resolveDraft(localDraft, serverDraft);

    if (resolved && resolved.data && Object.keys(resolved.data).length > 0) {
      console.log('[FORM] Rascunho encontrado', { source: resolved.source, step: resolved.currentStep });
      setPendingDraft(resolved);
      setShowDraftRestore(true);
    }
  }, [token, serverDraft]);

  /* ── Salva no localStorage com debounce de 800ms ── */
  const saveDraftLocal = useCallback((data, currentStep) => {
    if (!token) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      saveLocalDraft(token, data, currentStep);
    }, 800);
  }, [token]);

  /* ── Salva no servidor (chamado ao trocar de etapa) ── */
  const saveDraftToServer = useCallback(async (data, currentStep) => {
    if (!token) return;

    const success = await saveServerDraft(token, data, currentStep);

    if (success) {
      // Mostra indicador "✓ Salvo" por 2 segundos
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  }, [token]);

  /* ── Aceita restaurar o rascunho ── */
  const acceptDraft = useCallback(() => {
    setShowDraftRestore(false);
    // Retorna os dados para o wizard restaurar
    return pendingDraft;
  }, [pendingDraft]);

  /* ── Recusa o rascunho e começa do zero ── */
  const rejectDraft = useCallback(() => {
    if (token) {
      localStorage.removeItem(getDraftKey(token));
      console.log('[FORM] Rascunho descartado pelo usuário');
    }
    setPendingDraft(null);
    setShowDraftRestore(false);
  }, [token]);

  /* ── Limpa rascunho após submit final ── */
  const clearDraft = useCallback(() => {
    if (token) {
      localStorage.removeItem(getDraftKey(token));
      console.log('[FORM] Rascunho removido após submit');
    }
  }, [token]);

  /* ── Limpa debounce ao desmontar ── */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    // Estado
    pendingDraft,
    showDraftRestore,
    showSaved,
    // Ações
    saveDraftLocal,
    saveDraftToServer,
    acceptDraft,
    rejectDraft,
    clearDraft,
  };
}
