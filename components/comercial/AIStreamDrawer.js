/**
 * components/comercial/AIStreamDrawer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drawer lateral 480px reusável para streaming de IA via SSE.
 *
 * Props:
 *   - title              (string)
 *   - phases             (array de { key, label }) — fases visuais
 *   - jobId              (string) — null = só mostra cache
 *   - streamUrl          (function: jobId => url SSE absoluta)
 *   - onDone             (data) — callback quando type='done'
 *   - onError            (msg)
 *   - onMinimize         () — callback quando usuário escolhe "rodar em segundo plano"
 *   - onClose            ()
 *   - cachedAt, cachedContent, cachedSigmaScore, cachedSourcesUsed
 *   - footerActions      (ReactNode) — botões custom no rodapé
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import styles from '../../assets/style/aiStreamDrawer.module.css';
import MarkdownRender from './MarkdownRender';

export default function AIStreamDrawer({
  title = 'Análise IA',
  phases = [],
  jobId,
  streamUrl,
  onDone,
  onError,
  onMinimize,
  onClose,
  cachedAt,
  cachedContent,
  cachedSigmaScore,
  cachedSourcesUsed,
  footerActions,
}) {
  const [phaseStates, setPhaseStates] = useState(() =>
    Object.fromEntries(phases.map(p => [p.key, 'pending']))
  );
  const [activePhase, setActivePhase] = useState(null);
  const [content, setContent]         = useState(cachedContent || '');
  const [sigmaScore, setSigmaScore]   = useState(cachedSigmaScore ?? null);
  const [sourcesUsed, setSourcesUsed] = useState(cachedSourcesUsed || null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const startedAtRef                  = useRef(0);
  const esRef                         = useRef(null);

  // Reset on jobId change
  useEffect(() => {
    setPhaseStates(Object.fromEntries(phases.map(p => [p.key, 'pending'])));
    setActivePhase(null);
    setErrorMsg('');
    if (jobId) {
      setContent('');
      setSigmaScore(null);
      setSourcesUsed(null);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [jobId]);

  // SSE
  useEffect(() => {
    if (!jobId) return;
    const url = streamUrl(jobId);
    setIsStreaming(true);
    setErrorMsg('');
    startedAtRef.current = Date.now();
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        switch (data.type) {
          case 'phase':
            setActivePhase(data.phase);
            setPhaseStates(prev => {
              const next = { ...prev };
              for (const p of phases) {
                if (p.key === data.phase) { next[p.key] = 'active'; break; }
                if (next[p.key] === 'pending' || next[p.key] === 'active') {
                  next[p.key] = 'done';
                }
              }
              return next;
            });
            break;
          case 'phase_done':
            setPhaseStates(prev => ({ ...prev, [data.phase]: 'done' }));
            break;
          case 'phase_warn':
            setPhaseStates(prev => ({ ...prev, [data.phase]: 'done' }));
            break;
          case 'search_done': break;
          case 'chunk':
            if (data.fullText) setContent(data.fullText);
            break;
          case 'done':
            setIsStreaming(false);
            setActivePhase(null);
            for (const p of phases) {
              setPhaseStates(prev => ({ ...prev, [p.key]: 'done' }));
            }
            if (data.fullText)            setContent(data.fullText);
            if (typeof data.sigmaScore === 'number') setSigmaScore(data.sigmaScore);
            if (data.sourcesUsed)         setSourcesUsed(data.sourcesUsed);
            es.close();
            onDone?.(data);
            break;
          case 'error':
            setIsStreaming(false);
            setActivePhase(null);
            setPhaseStates(prev => {
              const next = { ...prev };
              if (data.phase && next[data.phase] !== undefined) next[data.phase] = 'error';
              return next;
            });
            setErrorMsg(data.message || 'Falha desconhecida');
            es.close();
            onError?.(data.message || 'Falha desconhecida');
            break;
          default: break;
        }
      } catch {}
    };

    es.onerror = () => { /* auto-retry; deixa user fechar */ };

    return () => { es.close(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [jobId, streamUrl]);

  // Timer de elapsed
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  function dotClass(state) {
    if (state === 'active') return `${styles.phaseDot} ${styles.phaseDotActive}`;
    if (state === 'done')   return `${styles.phaseDot} ${styles.phaseDotDone}`;
    if (state === 'error')  return `${styles.phaseDot} ${styles.phaseDotError}`;
    return styles.phaseDot;
  }

  function handleMinimize() {
    // Não fecha o EventSource — deixa rodando em background.
    // Só notifica o parent que pode fechar UI e exibir toast.
    onMinimize?.();
  }

  function handleClose() {
    // Fecha SSE manualmente (cancela só o listener do client; worker continua)
    if (esRef.current) {
      try { esRef.current.close(); } catch {}
      esRef.current = null;
    }
    onClose?.();
  }

  const showCachedNotice = !jobId && cachedAt && content;
  const sources = sourcesUsed || {};
  const fmtElapsed = (() => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  })();

  return (
    <>
      <div className={styles.backdrop} onClick={isStreaming ? handleMinimize : handleClose} />
      <aside className={styles.drawer} role="dialog" aria-label={title}>
        <header className={styles.header}>
          <span className={styles.headerIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9 12 2" />
            </svg>
          </span>
          <span className={styles.headerTitle}>{title}</span>
          {isStreaming && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              color: 'var(--brand-400)',
              letterSpacing: '0.06em',
              marginLeft: 8,
            }}>
              ● {fmtElapsed}
            </span>
          )}
          <button
            className={styles.closeBtn}
            onClick={isStreaming ? handleMinimize : handleClose}
            title={isStreaming ? 'Minimizar (continua em segundo plano)' : 'Fechar'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className={styles.body}>
          {showCachedNotice && (
            <div className={styles.cachedNotice}>
              ⓘ Última análise há {Math.max(1, Math.floor((Date.now() - new Date(cachedAt).getTime()) / 86400000))}d.
            </div>
          )}

          {(jobId || isStreaming) && phases.length > 0 && (
            <div className={styles.phases}>
              {phases.map(p => {
                const state = phaseStates[p.key];
                const isActive = state === 'active';
                return (
                  <div key={p.key} className={`${styles.phaseItem} ${isActive ? styles.phaseItemActive : ''}`}>
                    <span className={dotClass(state)}>
                      {state === 'done' && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {state === 'error' && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6"  y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                    </span>
                    <span className={styles.phaseLabel}>{p.label}</span>
                    {isActive && <span className={styles.phaseSpinner} />}
                  </div>
                );
              })}
            </div>
          )}

          {errorMsg && (
            <div className={styles.errorBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Falha ao gerar análise</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {errorMsg}
                </div>
              </div>
            </div>
          )}

          {sigmaScore != null && (
            <div className={styles.scoreBlock}>
              <div>
                <div className={styles.scoreLabel}>Sigma Score</div>
                <div className={styles.scoreValue}>{sigmaScore}/100</div>
              </div>
              <div className={styles.scoreBar}>
                <div className={styles.scoreBarFill}
                     style={{ width: `${Math.max(2, Math.min(100, sigmaScore))}%` }} />
              </div>
            </div>
          )}

          {sourcesUsed && (
            <div className={styles.sourcesRow}>
              {['website', 'deepSearch', 'metaAds'].map(k => (
                <span key={k}
                      className={`${styles.sourceBadge} ${sources[k] ? styles.sourceBadgeOn : styles.sourceBadgeOff}`}>
                  {sources[k] ? '✓' : '−'} {k === 'deepSearch' ? 'Web Search' : k === 'metaAds' ? 'Meta Ads' : 'Site'}
                </span>
              ))}
            </div>
          )}

          {content && <MarkdownRender source={content} className={styles.content} />}

          {!content && !errorMsg && isStreaming && (
            <div className={styles.skeletonBlock}>
              <div className={styles.skel} style={{ width: '60%', height: 14 }} />
              <div className={styles.skel} style={{ width: '90%', height: 10, marginTop: 8 }} />
              <div className={styles.skel} style={{ width: '85%', height: 10, marginTop: 6 }} />
              <div className={styles.skel} style={{ width: '70%', height: 10, marginTop: 6 }} />
              <div className={styles.skel} style={{ width: '40%', height: 14, marginTop: 18 }} />
              <div className={styles.skel} style={{ width: '95%', height: 10, marginTop: 8 }} />
              <div className={styles.skel} style={{ width: '88%', height: 10, marginTop: 6 }} />
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {isStreaming ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleMinimize}
                style={{ flex: 1 }}
              >
                Continuar em segundo plano
              </button>
            </>
          ) : footerActions ? (
            footerActions
          ) : (
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Fechar</button>
          )}
        </footer>
      </aside>
    </>
  );
}
