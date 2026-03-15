/**
 * hooks/useAuth.js
 * Hook de autenticação: verifica sessão via /api/auth/me (cookie httpOnly).
 * Redireciona para /login se não autenticado.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export function useAuth() {
  const router = useRouter();
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('not_authenticated');
        const data = await res.json();
        if (data.success && !cancelled) setUser(data.user);
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkAuth();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Logout: invalida cookie e redireciona */
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignora erros de rede */ }
    router.push('/login');
  };

  return { user, loading, logout };
}
