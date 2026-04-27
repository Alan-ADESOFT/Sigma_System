/**
 * components/ads/AdsCampaignsTree.js
 * Tabela hierárquica drill-down de campaigns → adsets → ads.
 *
 * Assume que:
 *   campaigns: [{ id, name, effective_status, insights, adsets?: [{ id, name, ..., ads?: [...] }] }]
 *   Quando vira "expanded" e o adset não tem .ads, o componente faz lazy-load via onLoadAdsets/onLoadAds.
 *
 * Ações por linha: pause, resume, analyze (chama AdsAIInsightsModal externamente).
 */

import { Fragment, useState } from 'react';
import styles from '../../assets/style/ads.module.css';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function fmtMoney(v) { return v == null ? '—' : BRL.format(Number(v) || 0); }
function fmtNum(v)   { return v == null ? '—' : NUM.format(Number(v) || 0); }
function fmtPct(v)   { return v == null ? '—' : `${Number(v).toFixed(2)}%`; }
function fmtRoas(insights) {
  const v = parseFloat(insights?.purchase_roas?.[0]?.value || 0);
  return v ? `${v.toFixed(2)}x` : '—';
}
function sumActions(actions) {
  if (!actions) return 0;
  return actions
    .filter((a) => /offsite_conversion|lead|purchase|complete_registration/.test(a.action_type))
    .reduce((s, a) => s + (parseInt(a.value) || 0), 0);
}

function StatusPill({ status }) {
  const s = (status || '').toUpperCase();
  let cls = styles.pillMuted;
  if (s === 'ACTIVE') cls = styles.pillActive;
  else if (s === 'PAUSED') cls = styles.pillPaused;
  else if (s.includes('DISAPPROVED') || s.includes('REJECTED')) cls = styles.pillError;
  return <span className={`${styles.statusPill} ${cls}`}>{s || '—'}</span>;
}

function ActionButtons({ obj, level, busy, onPause, onResume, onAnalyze }) {
  const isActive = obj.effective_status === 'ACTIVE';
  return (
    <div className={styles.actionsCol}>
      {isActive ? (
        <button type="button" className={styles.iconAction} title="Pausar" disabled={busy} onClick={() => onPause(obj, level)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
      ) : (
        <button type="button" className={styles.iconAction} title="Retomar" disabled={busy} onClick={() => onResume(obj, level)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>
        </button>
      )}
      <button type="button" className={styles.iconAction} title="Analisar com IA" onClick={() => onAnalyze(level, obj.id, obj.name)}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
  );
}

export default function AdsCampaignsTree({
  campaigns = [],
  busyId = null,
  onPause,
  onResume,
  onAnalyze,
  onLoadAdsets,
  onLoadAds,
}) {
  const [expandedC, setExpandedC] = useState(new Set());
  const [expandedS, setExpandedS] = useState(new Set());

  function toggleC(id) {
    setExpandedC((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else { next.add(id); onLoadAdsets?.(id); }
      return next;
    });
  }
  function toggleS(id) {
    setExpandedS((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else { next.add(id); onLoadAds?.(id); }
      return next;
    });
  }

  if (campaigns.length === 0) {
    return (
      <div className={styles.emptyTableRich}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <div>Nenhuma campanha encontrada</div>
        <div className={styles.emptyTableHint}>Tente um período maior ou crie sua primeira campanha no Gerenciador de Anúncios da Meta.</div>
      </div>
    );
  }

  return (
    <div className={styles.treeWrap}>
      <table className={styles.treeTable}>
        <thead>
          <tr>
            <th style={{ minWidth: 240 }}>Nome</th>
            <th>Status</th>
            <th>Gasto</th>
            <th>Cliques</th>
            <th>CTR</th>
            <th>ROAS</th>
            <th>Conv.</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const isExpC = expandedC.has(c.id);
            const ins = c.insights || {};
            return (
              <Fragment key={c.id}>
                <tr className={styles.rowCampaign}>
                  <td>
                    <button type="button" className={styles.toggleBtn} onClick={() => toggleC(c.id)} aria-label={isExpC ? 'Colapsar' : 'Expandir'}>
                      {isExpC ? '▼' : '▶'}
                    </button>
                    <span className={styles.nameText}>{c.name}</span>
                  </td>
                  <td><StatusPill status={c.effective_status} /></td>
                  <td>{fmtMoney(ins.spend)}</td>
                  <td>{fmtNum(ins.clicks)}</td>
                  <td>{fmtPct(ins.ctr)}</td>
                  <td>{fmtRoas(ins)}</td>
                  <td>{fmtNum(sumActions(ins.actions))}</td>
                  <td>
                    <ActionButtons obj={c} level="campaign" busy={busyId === c.id} onPause={onPause} onResume={onResume} onAnalyze={onAnalyze} />
                  </td>
                </tr>
                {isExpC && (c.adsets || []).map((s) => {
                  const isExpS = expandedS.has(s.id);
                  const ins2 = s.insights || {};
                  return (
                    <Fragment key={s.id}>
                      <tr className={styles.rowAdset}>
                        <td className={styles.indent1}>
                          <button type="button" className={styles.toggleBtn} onClick={() => toggleS(s.id)} aria-label={isExpS ? 'Colapsar' : 'Expandir'}>
                            {isExpS ? '▼' : '▶'}
                          </button>
                          <span className={styles.nameText}>{s.name}</span>
                        </td>
                        <td><StatusPill status={s.effective_status} /></td>
                        <td>{fmtMoney(ins2.spend)}</td>
                        <td>{fmtNum(ins2.clicks)}</td>
                        <td>{fmtPct(ins2.ctr)}</td>
                        <td>{fmtRoas(ins2)}</td>
                        <td>{fmtNum(sumActions(ins2.actions))}</td>
                        <td>
                          <ActionButtons obj={s} level="adset" busy={busyId === s.id} onPause={onPause} onResume={onResume} onAnalyze={onAnalyze} />
                        </td>
                      </tr>
                      {isExpS && (s.ads || []).map((a) => {
                        const ins3 = a.insights || {};
                        return (
                          <tr key={a.id} className={styles.rowAd}>
                            <td className={styles.indent2}>
                              <span className={styles.dotSpacer} />
                              <span className={styles.nameText}>{a.name}</span>
                            </td>
                            <td><StatusPill status={a.effective_status} /></td>
                            <td>{fmtMoney(ins3.spend)}</td>
                            <td>{fmtNum(ins3.clicks)}</td>
                            <td>{fmtPct(ins3.ctr)}</td>
                            <td>{fmtRoas(ins3)}</td>
                            <td>{fmtNum(sumActions(ins3.actions))}</td>
                            <td>
                              <ActionButtons obj={a} level="ad" busy={busyId === a.id} onPause={onPause} onResume={onResume} onAnalyze={onAnalyze} />
                            </td>
                          </tr>
                        );
                      })}
                      {isExpS && !(s.ads?.length) && (
                        <tr><td colSpan={8} className={styles.indent2 + ' ' + styles.emptyInline}>Nenhum anúncio neste conjunto</td></tr>
                      )}
                    </Fragment>
                  );
                })}
                {isExpC && !(c.adsets?.length) && (
                  <tr><td colSpan={8} className={styles.indent1 + ' ' + styles.emptyInline}>Nenhum conjunto nesta campanha</td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
