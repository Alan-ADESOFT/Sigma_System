/**
 * components/ads/AdsAccountConnector.js
 * Card de conexão usado em TabAds quando NÃO há conta vinculada.
 * 2 caminhos: OAuth (popup) ou Manual (form expandido).
 */

import { useState, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/adsClient.module.css';

export default function AdsAccountConnector({ clientId, onConnected }) {
  const { notify } = useNotification();
  const [connecting, setConnecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [form, setForm] = useState({ accessToken: '', adsAccountId: '', pageId: '', businessId: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onMessage(ev) {
      const data = ev.data;
      if (!data || data.type !== 'ads-oauth-result') return;
      if (data.success) {
        notify('Conta de Ads conectada', 'success');
        onConnected?.();
      } else {
        notify(`Falha na conexão: ${data.error || 'erro'}`, 'error');
      }
      setConnecting(false);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onConnected, notify]);

  function handleOAuth() {
    setConnecting(true);
    const w = 600, h = 720;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top  = window.screenY + (window.outerHeight - h) / 2;
    const url = `/api/ads/accounts/oauth-start?clientId=${encodeURIComponent(clientId)}`;
    const popup = window.open(url, 'ads_oauth', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no`);
    if (!popup) {
      notify('Pop-up bloqueado. Permita pop-ups deste site.', 'error');
      setConnecting(false);
      return;
    }
    const checkClosed = setInterval(() => {
      if (popup.closed) { clearInterval(checkClosed); setConnecting((c) => c ? false : c); }
    }, 600);
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!form.accessToken.trim() || !form.adsAccountId.trim()) {
      notify('Token e Ad Account ID são obrigatórios', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/ads/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          accessToken: form.accessToken.trim(),
          adsAccountId: form.adsAccountId.trim(),
          pageId: form.pageId.trim() || undefined,
          businessId: form.businessId.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao conectar');
      notify('Conta vinculada manualmente', 'success');
      onConnected?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`glass-card ${styles.connectorCard}`}>
      <div className={styles.connectorHeader}>
        <div className={styles.metaIcon} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 22-7z" />
          </svg>
        </div>
        <div>
          <div className={styles.connectorTitle}>Meta Ads</div>
          <div className={styles.connectorMicro}>NENHUMA CONTA CONECTADA</div>
        </div>
      </div>
      <div className={styles.connectorBody}>
        Conecte a conta Meta Ads do cliente para acessar métricas, criar relatórios e usar a IA de análise.
      </div>
      <div className={styles.connectorActions}>
        <button type="button" className="sigma-btn-primary" disabled={connecting} onClick={handleOAuth}>
          {connecting ? 'Conectando...' : 'Conectar via OAuth'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowManual((v) => !v)}>
          {showManual ? 'Cancelar manual' : '+ Inserir manualmente'}
        </button>
      </div>

      {showManual && (
        <form onSubmit={handleManualSubmit} className={styles.manualForm}>
          <label className={styles.manualLabel}>
            <span>Access Token</span>
            <textarea
              required
              rows={3}
              className="sigma-input"
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              placeholder="EAA... (long-lived ou system-user)"
            />
          </label>
          <label className={styles.manualLabel}>
            <span>Ad Account ID</span>
            <input
              required
              className="sigma-input"
              value={form.adsAccountId}
              onChange={(e) => setForm((f) => ({ ...f, adsAccountId: e.target.value }))}
              placeholder="act_XXXXXXXXX"
            />
          </label>
          <div className={styles.manualRow}>
            <label className={styles.manualLabel}>
              <span>Page ID (opcional)</span>
              <input
                className="sigma-input"
                value={form.pageId}
                onChange={(e) => setForm((f) => ({ ...f, pageId: e.target.value }))}
                placeholder="123456789"
              />
            </label>
            <label className={styles.manualLabel}>
              <span>Business ID (opcional)</span>
              <input
                className="sigma-input"
                value={form.businessId}
                onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))}
                placeholder="123456789"
              />
            </label>
          </div>
          <div className={styles.manualActions}>
            <button type="submit" className="sigma-btn-primary" disabled={submitting}>
              {submitting ? 'Validando...' : 'Validar e salvar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
