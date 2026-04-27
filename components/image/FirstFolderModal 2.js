/**
 * components/image/FirstFolderModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal mostrado quando o usuário clica em um cliente que ainda não tem
 * NENHUMA pasta criada. Incentiva a criar a primeira de forma simples
 * (apenas nome). Após salvar, o componente pai abre o workspace já com
 * essa pasta selecionada.
 *
 * Props:
 *   · clientName — para personalizar o copy
 *   · clientId   — passado pra criação via API
 *   · onCreated(folder) — callback após sucesso
 *   · onClose()         — fecha sem criar
 *   · onSkip()          — pula a criação e abre o workspace sem pasta
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageHomePage.module.css';

const SUGGESTIONS = [
  'Lançamento da Coleção',
  'Posts de Lifestyle',
  'Ofertas e Campanhas',
  'Identidade Visual',
];

export default function FirstFolderModal({ clientName, clientId, onCreated, onClose, onSkip }) {
  const { notify } = useNotification();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
    function onKey(e) {
      if (e.key === 'Escape' && !saving) onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  async function submit(e) {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) {
      notify('Dê um nome para a pasta', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/image/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name: trimmed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'falha ao criar pasta');
      notify('Pasta criada', 'success');
      onCreated?.(json.data);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.firstFolderOverlay} onClick={saving ? undefined : onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className={styles.firstFolderCard}
      >
        <button
          type="button"
          className={styles.firstFolderClose}
          onClick={onClose}
          disabled={saving}
          aria-label="Fechar"
        >
          <Icon name="x" size={12} />
        </button>

        <div className={styles.firstFolderIcon}>
          <Icon name="folderPlus" size={28} />
        </div>

        <h2 className={styles.firstFolderTitle}>
          Crie a primeira pasta de {clientName}
        </h2>

        <p className={styles.firstFolderDesc}>
          Pastas organizam as gerações por campanha, projeto ou tema. Você pode
          criar quantas quiser depois — comece com uma.
        </p>

        <input
          ref={inputRef}
          type="text"
          className={styles.firstFolderInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Lançamento da Coleção"
          maxLength={80}
          disabled={saving}
        />

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          justifyContent: 'center',
          marginBottom: 18,
        }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              disabled={saving}
              style={{
                padding: '5px 10px',
                background: 'rgba(10,10,10,0.5)',
                border: '1px solid var(--border-default)',
                borderRadius: 12,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--border-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <div className={styles.firstFolderActions}>
          {onSkip && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onSkip}
              disabled={saving}
            >
              Pular por enquanto
            </button>
          )}
          <button
            type="submit"
            className="sigma-btn-primary"
            disabled={saving || !name.trim()}
          >
            <Icon name="folderPlus" size={12} />
            {saving ? 'Criando...' : 'Criar pasta e continuar'}
          </button>
        </div>

        <div className={styles.firstFolderHint}>
          Você pode criar mais pastas depois pelo workspace.
        </div>
      </form>
    </div>
  );
}
