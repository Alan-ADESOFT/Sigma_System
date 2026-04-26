/**
 * components/image/RateLimitBadge.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Badge "25/30 imagens hoje". Polling visibility-aware: 30s quando há job
 * ativo, 5min quando ocioso. Tooltip mostra detalhes (hourly + daily +
 * concurrent).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

export default function RateLimitBadge({ activePolling = false, refreshTrigger = 0 }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/image/rate-limit/check');
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('[ERRO][Frontend:RateLimitBadge]', err.message);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, refreshTrigger]);

  // Polling visibility-aware
  useEffect(() => {
    let id;
    function tick() { fetchStatus(); }
    function start() {
      const interval = activePolling ? 30 * 1000 : 5 * 60 * 1000;
      id = setInterval(tick, interval);
    }
    function stop() { if (id) clearInterval(id); }

    function onVisibility() {
      stop();
      if (document.visibilityState === 'visible') start();
    }

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [activePolling, fetchStatus]);

  if (!data) {
    return (
      <span className={styles.rateLimit} title="Carregando...">
        <Icon name="zap" size={11} />
        <span>—</span>
      </span>
    );
  }

  const used  = (data.limits?.daily || 0) - (data.remaining?.daily || 0);
  const total = data.limits?.daily || 0;
  const ratio = total > 0 ? (data.remaining.daily / total) : 1;

  const colorClass = ratio > 0.5 ? styles.green : ratio > 0.2 ? styles.yellow : styles.red;

  return (
    <span
      ref={wrapperRef}
      className={`${styles.rateLimit} ${colorClass}`}
      style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Icon name="zap" size={11} />
      <span>{used}/{total} hoje</span>

      {open && (
        <div className={styles.rateLimitTooltip}>
          <div><strong>Hoje:</strong> {used}/{total} ({data.remaining.daily} restante)</div>
          <div><strong>Esta hora:</strong> {data.limits.hourly - data.remaining.hourly}/{data.limits.hourly}</div>
          <div><strong>Em geração agora:</strong> {data.concurrent.current}/{data.concurrent.max}</div>
          {data.isAdmin && (
            <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: '0.6rem' }}>
              Limites de admin
            </div>
          )}
        </div>
      )}
    </span>
  );
}
