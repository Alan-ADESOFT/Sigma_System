/**
 * components/image/ImageGenerationToast.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Toast persistente no canto inferior direito que acompanha o job em
 * background (após o usuário fechar o overlay). Quando completa, vira
 * clicável para abrir a imagem no detail modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageGeneration.module.css';

export default function ImageGenerationToast({
  jobId,
  onComplete,
  onError,
  onClose,
  onClick,
}) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const res = await fetch(`/api/image/status/${jobId}`);
        const json = await res.json();
        if (!json.success || cancelled) return;
        const j = json.data;
        setJob(j);

        if (j.status === 'done')      { onComplete?.(j); return; }
        if (j.status === 'error')     { onError?.(j);    return; }
        if (j.status === 'cancelled') { onClose?.(j);    return; }
        timer = setTimeout(poll, 3000);
      } catch (err) {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }

    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const status = job?.status || 'queued';
  const isDone   = status === 'done';
  const isError  = status === 'error';
  const isActive = status === 'queued' || status === 'running';

  const klass = `${styles.toast} ${isDone ? styles.toastSuccess : ''} ${isError ? styles.toastError : ''} ${isDone ? styles.toastClickable : ''}`;

  return (
    <div
      className={klass}
      onClick={isDone ? () => onClick?.(job) : undefined}
      role={isDone ? 'button' : 'status'}
    >
      <div className={styles.toastHeader}>
        <span className={styles.toastTitle}>
          {isDone   && 'Imagem pronta'}
          {isError  && 'Falha na geração'}
          {isActive && 'Gerando em background'}
        </span>
        <button type="button" className={styles.toastClose} onClick={e => { e.stopPropagation(); onClose?.(); }} aria-label="Fechar">
          <Icon name="x" size={11} />
        </button>
      </div>

      <div className={styles.toastBody}>
        {isDone   && 'Sua imagem está pronta. Clique para visualizar.'}
        {isError  && (job?.error_message || 'Tente novamente ou ajuste a descrição.').slice(0, 140)}
        {isActive && (job?.optimized_prompt ? 'Renderizando pixels...' : 'Otimizando prompt e enfileirando...')}
      </div>

      {isActive && (
        <div className={styles.toastSpinner}>
          <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
          <span>{(job?.model || '...').toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}
