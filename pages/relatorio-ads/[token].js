/**
 * pages/relatorio-ads/[token].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página PÚBLICA de relatório de Ads. SEM DashboardLayout, SEM auth.
 *
 * Estados:
 *   loading   → validando token
 *   invalid   → not_found / expired / revoked / etc
 *   ok        → relatório renderizado
 *
 * Endpoints usados (todos públicos):
 *   GET  /api/ads/public/validate-token
 *   POST /api/ads/public/report
 *   GET  /api/ads/public/export-pdf (link direto)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AdsKpiCards from '../../components/ads/AdsKpiCards';
import AdsTimelineChart from '../../components/ads/AdsTimelineChart';
import styles from '../../assets/style/adsPublic.module.css';

const DATE_PRESETS = [
  { value: 'last_7d',     label: '7 dias' },
  { value: 'last_14d',    label: '14 dias' },
  { value: 'last_30d',    label: '30 dias' },
  { value: 'last_90d',    label: '90 dias' },
  { value: 'this_month',  label: 'Este mês' },
  { value: 'last_month',  label: 'Mês passado' },
];

const REASON_MESSAGES = {
  not_found:    'Este link de relatório não foi encontrado.',
  invalid_format: 'O endereço do relatório é inválido.',
  revoked:      'Este link foi revogado pela agência.',
  expired:      'Este link de relatório já expirou.',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmtMoney = (v) => v == null ? '—' : BRL.format(Number(v) || 0);
const fmtNum   = (v) => v == null ? '—' : NUM.format(Number(v) || 0);
const fmtPct   = (v) => v == null ? '—' : `${Number(v).toFixed(2)}%`;
const fmtRoas  = (ins) => {
  const v = parseFloat(ins?.purchase_roas?.[0]?.value || 0);
  return v ? `${v.toFixed(2)}x` : '—';
};

export default function PublicReportPage() {
  const router = useRouter();
  const { token } = router.query;
  const [validation, setValidation] = useState({ state: 'loading', reason: null, client: null, config: null });
  const [datePreset, setDatePreset] = useState('last_30d');
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState(null);

  /* Valida o token */
  useEffect(() => {
    if (!token) return;
    fetch(`/api/ads/public/validate-token?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          setValidation({ state: 'invalid', reason: 'error', client: null, config: null });
          return;
        }
        if (!d.valid) {
          setValidation({ state: 'invalid', reason: d.reason, client: null, config: null });
          return;
        }
        setValidation({ state: 'ok', reason: null, client: d.client, config: d.config });
        if (d.config?.defaultDateRange) setDatePreset(d.config.defaultDateRange);
      })
      .catch(() => setValidation({ state: 'invalid', reason: 'error', client: null, config: null }));
  }, [token]);

  /* Carrega o relatório */
  const loadReport = useCallback(async () => {
    if (validation.state !== 'ok' || !token) return;
    setLoadingReport(true); setError(null);
    try {
      const r = await fetch('/api/ads/public/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, datePreset }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao carregar relatório');
      setReport(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingReport(false);
    }
  }, [token, datePreset, validation.state]);
  useEffect(() => { loadReport(); }, [loadReport]);

  /* ─── ESTADOS ─── */
  if (validation.state === 'loading') {
    return (
      <PageShell>
        <div className={styles.centerState}>
          <div className={styles.spinner} aria-hidden="true" />
          <div className={styles.centerText}>Validando link...</div>
        </div>
      </PageShell>
    );
  }

  if (validation.state === 'invalid') {
    const msg = REASON_MESSAGES[validation.reason] || 'Link indisponível.';
    return (
      <PageShell>
        <div className={styles.centerState}>
          <div className={styles.invalidIcon} aria-hidden="true">✕</div>
          <h1 className={styles.invalidTitle}>Relatório indisponível</h1>
          <p className={styles.invalidText}>{msg}</p>
          <p className={styles.muted}>Entre em contato com a agência para receber um novo link.</p>
        </div>
      </PageShell>
    );
  }

  /* ─── OK ─── */
  const client = validation.client;
  const config = validation.config || {};
  const exportUrl = `/api/ads/public/export-pdf?token=${encodeURIComponent(token)}&datePreset=${datePreset}`;

  return (
    <PageShell>
      <Head>
        <title>Relatório de Ads — {client?.companyName || 'SIGMA'}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header className={styles.topbar}>
        <div className={styles.brandRow}>
          {client?.logoUrl ? (
            <img src={client.logoUrl} alt={client.companyName} className={styles.clientLogo} />
          ) : (
            <div className={styles.clientLogoPlaceholder}>
              {(client?.companyName || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className={styles.clientName}>{client?.companyName}</div>
            <div className={styles.reportLabel}>Relatório de Tráfego Pago</div>
          </div>
        </div>
        <div className={styles.controls}>
          <select className={styles.dateSelect} value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
            {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {config.allowExport && (
            <a className="btn btn-secondary" href={exportUrl} target="_blank" rel="noreferrer noopener">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Baixar PDF
            </a>
          )}
        </div>
      </header>

      {report?.range && (
        <div className={styles.periodBanner}>
          Período: {new Date(report.range.since).toLocaleDateString('pt-BR')} — {new Date(report.range.until).toLocaleDateString('pt-BR')}
        </div>
      )}

      {error && (
        <div className={styles.errorBox}>
          {error}
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadReport} style={{ marginLeft: 12 }}>
            Tentar novamente
          </button>
        </div>
      )}

      {!error && (
        <>
          <AdsKpiCards
            kpiSummary={report?.kpiSummary}
            comparison={report?.comparison}
            loading={loadingReport}
          />

          {config.showChart !== false && report?.timeline && report.timeline.length > 0 && (
            <AdsTimelineChart timeline={report.timeline} initialMetric="spend" />
          )}

          {config.showCampaignList && report?.campaigns && (
            <section className={`glass-card ${styles.campaignsCard}`}>
              <div className={styles.sectionHeading}>Campanhas</div>
              {report.campaigns.length === 0 ? (
                <div className={styles.emptyTable}>Nenhuma campanha no período</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Status</th>
                        <th>Gasto</th>
                        <th>Impressões</th>
                        <th>CTR</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.campaigns.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td>{c.effective_status}</td>
                          <td>{fmtMoney(c.insights?.spend)}</td>
                          <td>{fmtNum(c.insights?.impressions)}</td>
                          <td>{fmtPct(c.insights?.ctr)}</td>
                          <td>{fmtRoas(c.insights)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <footer className={styles.footer}>
        Powered by <span className={styles.footerBrand}>SIGMA</span>
      </footer>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>{children}</div>
    </div>
  );
}
