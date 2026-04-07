/**
 * pages/dashboard/jarvis.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página dedicada do J.A.R.V.I.S — guia de comandos, estatísticas do dia e
 * histórico recente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import styles from '../../assets/style/jarvisPage.module.css';
import orbStyles from '../../assets/style/jarvisOrb.module.css';

/* Ícones inline minimalistas por grupo */
const GROUP_ICON = {
  'CLIENTES': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  'FINANCEIRO': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  'PIPELINE & IA': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  ),
  'DASHBOARD': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const FN_ICON = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function JarvisPage() {
  const [config, setConfig]   = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [usage, setUsage]     = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [cfgR, useR] = await Promise.all([
        fetch('/api/settings/jarvis-config'),
        fetch('/api/jarvis/usage'),
      ]);
      const cfg = await cfgR.json();
      const us  = await useR.json();
      if (cfg.success) { setConfig(cfg.config); setCatalog(cfg.functions_catalog || []); }
      if (us.success)  { setUsage(us); }
    } catch (err) {
      console.error('[ERRO][JarvisPage] loadAll', err.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const groupedFns = catalog.reduce((acc, fn) => {
    (acc[fn.group] = acc[fn.group] || []).push(fn);
    return acc;
  }, {});

  const stats = usage?.stats || { total: 0, byHour: Array(24).fill(0), topCommand: null, avgMs: 0 };
  const maxBar = Math.max(1, ...(stats.byHour || []));

  return (
    <DashboardLayout activeTab="jarvis">
      <div className={styles.pageContainer}>
        {/* HEADER */}
        <div className={styles.pageHeader}>
          <div className={`${orbStyles.orb} ${styles.headerOrb}`} />
          <div className={styles.headerText}>
            <h1 className={styles.headerTitle}>J.A.R.V.I.S</h1>
            <div className={styles.headerSubtitle}>Assistente de Comando — Sigma</div>
          </div>
          {usage && (
            <div className={styles.headerQuota}>
              <strong>{usage.remaining}</strong> / {usage.limit} restantes hoje
            </div>
          )}
        </div>

        {/* GRID */}
        <div className={styles.grid}>

          {/* ───── COL 1 — Funções ───── */}
          <div className={`glass-card ${styles.card}`}>
            <div className={styles.cardTitle}>Guia de Comandos</div>

            <div className={styles.fnList}>
              {Object.entries(groupedFns).map(([groupName, fns]) => (
                <div key={groupName} className={styles.fnGroup}>
                  <div className={styles.fnGroupTitle}>
                    {GROUP_ICON[groupName]}
                    {groupName}
                  </div>

                  {fns.map(fn => {
                    const on = config?.functions?.[fn.id];
                    return (
                      <div key={fn.id} className={styles.fnItem}>
                        <div className={styles.fnIcon}>{FN_ICON}</div>
                        <div className={styles.fnInfo}>
                          <div className={styles.fnTitle}>{fn.title}</div>
                          <div className={styles.fnDesc}>{fn.description}</div>
                        </div>
                        <span className={`${styles.fnBadge} ${on ? styles.badgeOn : styles.badgeOff}`}>
                          {on ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {!catalog.length && <div className={styles.empty}>Carregando funções...</div>}
            </div>
          </div>

          {/* ───── COL 2 — Estatísticas ───── */}
          <div className={`glass-card ${styles.card}`}>
            <div className={styles.cardTitle}>Hoje</div>

            <div className={styles.statsGrid}>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Comandos</div>
                <div className={styles.statValue}>{usage?.today_count || 0}</div>
                <div className={styles.statSub}>usados hoje</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Restantes</div>
                <div className={`${styles.statValue} ${styles.statValueAccent}`}>{usage?.remaining ?? '—'}</div>
                <div className={styles.statSub}>de {usage?.limit ?? '—'}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Tempo médio</div>
                <div className={styles.statValue}>{stats.avgMs || 0}<span style={{ fontSize: '0.7rem', marginLeft: 2 }}>ms</span></div>
                <div className={styles.statSub}>por comando</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Top comando</div>
                <div className={styles.statValue} style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stats.topCommand || '—'}
                </div>
                <div className={styles.statSub}>{stats.topCount ? `${stats.topCount}× hoje` : 'sem dados'}</div>
              </div>
            </div>

            <div className={styles.hourChart}>
              <div className={styles.hourChartLabel}>Uso por hora (00–23h)</div>
              <div className={styles.hourBars}>
                {stats.byHour.map((v, h) => (
                  <div
                    key={h}
                    className={styles.hourBar}
                    style={{ height: `${(v / maxBar) * 100}%`, opacity: v ? 1 : 0.15 }}
                    title={`${h}h — ${v} comando(s)`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ───── COL 3 — Histórico ───── */}
          <div className={`glass-card ${styles.card}`}>
            <div className={styles.cardTitle}>Histórico Recente</div>

            <div className={styles.historyList}>
              {(usage?.history || []).map(h => (
                <div key={h.id} className={styles.historyItem}>
                  <div className={styles.historyHeader}>
                    <span className={styles.historyCommand}>
                      <span className={`${styles.historyStatus} ${h.success ? styles.statusOk : styles.statusFail}`} />
                      {h.command}
                    </span>
                    <span className={styles.historyTime}>{formatTime(h.created_at)}</span>
                  </div>
                  <div className={styles.historyText}>
                    {h.input_text || h.response || '(sem texto)'}
                  </div>
                </div>
              ))}
              {(!usage?.history || !usage.history.length) && (
                <div className={styles.empty}>Sem interações registradas ainda.</div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <Link href="/dashboard/settings/jarvis">Configurar J.A.R.V.I.S →</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
