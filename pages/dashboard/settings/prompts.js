/**
 * /dashboard/settings/prompts — redireciona para Config. Pipeline (seção de prompts)
 */
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PromptsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/settings/pipeline#prompts');
  }, [router]);
  return null;
}
