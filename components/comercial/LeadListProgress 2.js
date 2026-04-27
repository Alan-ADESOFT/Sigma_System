/**
 * components/comercial/LeadListProgress.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel de progresso SSE — usado enquanto a lista está em status='running'.
 * Conecta em /api/comercial/captacao/jobs/[id]/stream e mostra updates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import styles from '../../assets/style/comercialCaptacao.module.css';

export default function LeadListProgress({ listId, onDone, onError }) {
  const [stage, setStage]   = useState('starting');
  const [message, setMsg]   = useState('Conectando...');
  const [count, setCount]   = useState(0);
  const startedRef          = useRef(Date.now());
  const [elapsed, setElapsed] = useState('0s');

  useEffect(() => {
    if (!listId) return;
    const es = new EventSource(`/api/comercial/captacao/jobs/${listId}/stream`);

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'progress' || data.type === 'snapshot') {
          if (data.stage)   setStage(data.stage);
          if (data.message) setMsg(data.message);
          if (typeof data.count === 'number')      setCount(data.count);
          if (typeof data.totalLeads === 'number') setCount(data.totalLeads);
        } else if (data.type === 'done') {
          setStage('done');
          setMsg(data.message || 'Concluído');
          if (typeof data.totalLeads === 'number') setCount(data.totalLeads);
          es.close();
          onDone?.();
        } else if (data.type === 'error') {
          setStage('error');
          setMsg(data.message || 'Falhou');
          es.close();
          onError?.(data.message);
        }
      } catch {}
    };

    es.onerror = () => {
      // EventSource auto-retries; só fechamos se a aba terminou
    };

    return () => es.close();
  }, [listId, onDone, onError]);

  useEffect(() => {
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - startedRef.current) / 1000);
      if (sec < 60) setElapsed(`${sec}s`);
      else setElapsed(`${Math.floor(sec / 60)}m ${sec % 60}s`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`glass-card ${styles.streamPanel}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {stage !== 'error' && stage !== 'done' && <div className={styles.streamSpinner} />}
        <div className={styles.streamMessage}>{message}</div>
        <div className={styles.streamCount}>
          {count > 0 ? `${count} leads · ` : ''}{elapsed}
        </div>
      </div>
      {stage !== 'error' && stage !== 'done' && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.62rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          paddingLeft: 32,
        }}>
          ⓘ Roda em segundo plano — você pode fechar essa aba e voltar depois.
        </div>
      )}
    </div>
  );
}
