/**
 * /dashboard/settings — redireciona para Config. Pipeline
 * A página antiga foi removida. Configurações agora estão em:
 *   /dashboard/settings/pipeline — modelos, fallback, prompts
 *   /dashboard/settings/copy     — modelo de copy, estruturas
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/settings/pipeline'); }, [router]);
  return null;
}
