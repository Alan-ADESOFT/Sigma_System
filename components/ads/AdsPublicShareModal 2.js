/**
 * components/ads/AdsPublicShareModal.js
 * Modal pra gerar link público compartilhável de relatório de Ads.
 *
 * Modos:
 *   · Modo "fixo" — recebe `clientId` + `clientName` (vem do dashboard de Ads)
 *   · Modo "selector" — recebe `clients` (lista) e mostra um <select> pra escolher
 */

import { useState, useMemo } from 'react';
import { useNotification } from '../../context/NotificationContext';
import ClientSelect from '../ClientSelect';
import styles from '../../assets/style/ads.module.css';

const EXPIRY_OPTIONS = [
  { value: null, label: 'Sem expiração' },
  { value: 30,   label: '30 dias' },
  { value: 90,   label: '90 dias' },
  { value: 180,  label: '180 dias' },
];

export default function AdsPublicShareModal({
  clientId: initialClientId,
  clientName,
  clients,
  onClose,
  onCreated,
}) {
  const { notify } = useNotification();
  const allowsSelection = !initialClientId && Array.isArray(clients);
  const [chosenClientId, setChosenClientId] = useState(initialClientId || '');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [config, setConfig] = useState({
    showCampaignList: true,
    showChart: true,
    allowExport: true,
    defaultDateRange: 'last_30d',
  });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const selectedClientName = useMemo(() => {
    if (clientName) return clientName;
    return clients?.find((c) => c.id === chosenClientId)?.company_name || '';
  }, [chosenClientId, clientName, clients]);

  async function handleGenerate() {
    if (!chosenClientId) {
      notify('Selecione um cliente para gerar o link', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch('/api/ads/public/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: chosenClientId, expiresInDays, config }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao gerar link');
      setResult(d);
      onCreated?.(d);
      notify('Link público gerado com sucesso', 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result?.link) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('Falha ao copiar — copie manualmente', 'warning');
    }
  }

  return (
    <div className="set-modal-overlay" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)' }}>
        <div className="set-modal-header">
          <div className="set-modal-header-title-box">
            <div className="set-modal-header-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <h2 className="set-modal-title">Compartilhar relatório</h2>
              <div className="set-modal-subtitle">
                {result
                  ? `Link gerado para ${selectedClientName || 'cliente'}`
                  : selectedClientName
                    ? `Para ${selectedClientName}`
                    : 'Gere um link público para o cliente acessar o relatório'}
              </div>
            </div>
          </div>
          <button type="button" className="set-modal-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="set-modal-body">
          {!result && (
            <>
              {allowsSelection && (
                <div className={styles.shareSection}>
                  <div className={styles.sectionHeading}>Cliente</div>
                  <ClientSelect
                    clients={clients}
                    value={chosenClientId}
                    onChange={setChosenClientId}
                    placeholder="Selecione o cliente do relatório..."
                  />
                </div>
              )}

              <div className={styles.shareSection}>
                <div className={styles.sectionHeading}>Validade do link</div>
                <div className={styles.expiryGrid}>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      className={`${styles.expiryBtn} ${expiresInDays === opt.value ? styles.expiryBtnActive : ''}`}
                      onClick={() => setExpiresInDays(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.shareSection}>
                <div className={styles.sectionHeading}>O que mostrar no relatório</div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={config.showChart}
                    onChange={(e) => setConfig((c) => ({ ...c, showChart: e.target.checked }))}
                  />
                  <span>Gráfico de timeline</span>
                </label>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={config.showCampaignList}
                    onChange={(e) => setConfig((c) => ({ ...c, showCampaignList: e.target.checked }))}
                  />
                  <span>Lista de campanhas</span>
                </label>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={config.allowExport}
                    onChange={(e) => setConfig((c) => ({ ...c, allowExport: e.target.checked }))}
                  />
                  <span>Permitir exportação em PDF</span>
                </label>
              </div>
            </>
          )}

          {result && (
            <div className={styles.resultBox}>
              <div className={styles.sectionHeading}>Link gerado</div>
              <div className={styles.linkRow}>
                <input className="sigma-input" readOnly value={result.link} onClick={(e) => e.target.select()} />
                <button type="button" className={`btn ${copied ? 'btn-secondary' : 'sigma-btn-primary'}`} onClick={handleCopy}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <div className={styles.resultMeta}>
                {result.expiresAt
                  ? `Expira em ${new Date(result.expiresAt).toLocaleDateString('pt-BR')}`
                  : 'Sem expiração'}
              </div>
              <a className={styles.openLink} href={result.link} target="_blank" rel="noreferrer noopener">
                Abrir em nova aba →
              </a>
            </div>
          )}
        </div>

        <div className="set-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result && (
            <button
              type="button"
              className="sigma-btn-primary"
              onClick={handleGenerate}
              disabled={generating || !chosenClientId}
            >
              {generating ? 'Gerando...' : 'Gerar link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
