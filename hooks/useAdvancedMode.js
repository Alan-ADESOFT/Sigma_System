/**
 * hooks/useAdvancedMode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Toggle global "Modo Avançado" do Gerador de Imagem (v1.2 — abril 2026).
 *
 * Acionado por Cmd/Ctrl+Shift+A em qualquer ponto. Persiste em localStorage
 * pra sobreviver a reloads. Quando ativo, expõe controles de implementação
 * que normalmente ficam escondidos:
 *   · Seletor manual de modelo (ModelSelector)
 *   · Seletor manual de modo por ref (inspiration/character/scene)
 *   · Seção "Modo Inteligente" das settings
 *
 * Uso:
 *   const { advancedMode, toggle } = useAdvancedMode();
 *
 * NÃO documentado em UI — pra debug do próprio user do projeto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { useNotification } from '../context/NotificationContext';

const STORAGE_KEY = 'image:advanced';

export function useAdvancedMode() {
  const { notify } = useNotification();
  const [advancedMode, setAdvancedMode] = useState(false);

  // Carrega do localStorage no mount (evita SSR mismatch deixando false default)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setAdvancedMode(true);
    } catch { /* ignora QuotaExceeded etc */ }
  }, []);

  const toggle = useCallback(() => {
    setAdvancedMode(prev => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        }
      } catch { /* ignora */ }
      // Feedback discreto
      try {
        notify(
          next ? 'Modo avançado ATIVADO' : 'Modo avançado desativado',
          'info',
          1800
        );
      } catch { /* notify pode estar fora de provider em rotas pequenas */ }
      return next;
    });
  }, [notify]);

  // Atalho global Cmd/Ctrl + Shift + A
  useEffect(() => {
    function onKey(e) {
      // Letra "A" — KeyA cobre layouts diferentes
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
        // Evita conflito com "Selecionar Tudo" (que é só Cmd/Ctrl+A, sem Shift)
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { advancedMode, toggle };
}
