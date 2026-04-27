/**
 * components/ads/AdsClientSelect.js
 * Wrapper sobre ClientSelect que pré-resolve "está conectado?" via
 * /api/ads/accounts/by-client e mostra um badge ao lado.
 */

import { useEffect, useState, useCallback } from 'react';
import ClientSelect from '../ClientSelect';
import styles from '../../assets/style/ads.module.css';

export default function AdsClientSelect({ clients, value, onChange, loading }) {
  const [connected, setConnected] = useState(null); // null = unknown, true/false após check
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (clientId) => {
    if (!clientId) { setConnected(null); return; }
    setChecking(true);
    try {
      const r = await fetch(`/api/ads/accounts/by-client/${clientId}`);
      const d = await r.json();
      setConnected(!!(d.success && d.account));
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(value); }, [value, check]);

  return (
    <div className={styles.clientSelectWrap}>
      <ClientSelect clients={clients} value={value} onChange={onChange} loading={loading} placeholder="Selecione um cliente..." />
      {value && (
        <span
          className={`${styles.connectionBadge} ${
            connected === true ? styles.connBadgeOk
            : connected === false ? styles.connBadgeOff
            : styles.connBadgeMuted
          }`}
        >
          {checking ? '...' : connected === true ? '✓ Conectado' : connected === false ? '○ Sem conta' : '...'}
        </span>
      )}
    </div>
  );
}
