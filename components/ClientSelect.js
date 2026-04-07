/**
 * components/ClientSelect.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Select de cliente marketing reutilizável (com busca inline).
 *
 * Usado em:
 *   · Gerador de Copy (pages/dashboard/social.js)
 *   · Dashboarding Social (pages/dashboard/social-dashboard.js)
 *   · Planejamento (pages/dashboard/content-plan.js)
 *   · Publicar Agora (pages/dashboard/publish.js)
 *
 * Props:
 *   clients     {Array}    Lista de clientes (cada um com id, company_name, niche, logo_url)
 *   value       {string}   ID do cliente selecionado
 *   onChange    {function} Callback (clientId | '')
 *   loading     {boolean}  Estado de carregamento
 *   placeholder {string}   Texto custom quando nada selecionado
 *   allowEmpty  {boolean}  Mostra opção "Sem cliente" para limpar
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import styles from '../assets/style/clientSelect.module.css';

function clientInitials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function ClientSelect({
  clients = [],
  value,
  onChange,
  loading = false,
  placeholder = 'Selecione uma empresa...',
  allowEmpty = false,
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find((c) => c.id === value);

  const filtered = clients.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.niche || '').toLowerCase().includes(q)
    );
  });

  /* Fecha ao clicar fora */
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* Foca o input ao abrir */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearchQuery('');
  }, [open]);

  function handleSelect(id) {
    onChange?.(id);
    setOpen(false);
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.open : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
      >
        {selected ? (
          <>
            {selected.logo_url ? (
              <img src={selected.logo_url} alt="" className={styles.avatar} />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {clientInitials(selected.company_name)}
              </div>
            )}
            <span className={styles.label}>
              {selected.company_name}
              {selected.niche && <span className={styles.niche}>{selected.niche}</span>}
            </span>
          </>
        ) : (
          <span className={styles.placeholder}>
            {loading
              ? 'Carregando clientes...'
              : clients.length === 0
                ? 'Nenhum cliente cadastrado'
                : placeholder}
          </span>
        )}

        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              className={styles.searchInput}
              placeholder="Pesquisar empresa ou segmento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.optionList}>
            {allowEmpty && (
              <div
                className={`${styles.option} ${!value ? styles.selected : ''}`}
                onClick={() => handleSelect('')}
              >
                <div className={styles.avatarPlaceholder} style={{ opacity: 0.5 }}>—</div>
                <div className={styles.optionLabel}>
                  <div>Sem cliente</div>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className={styles.empty}>
                {clients.length === 0 ? '// nenhum cliente cadastrado' : '// nenhum resultado'}
              </div>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  className={`${styles.option} ${c.id === value ? styles.selected : ''}`}
                  onClick={() => handleSelect(c.id)}
                >
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className={styles.avatar} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {clientInitials(c.company_name)}
                    </div>
                  )}
                  <div className={styles.optionLabel}>
                    <div className={styles.optionName}>{c.company_name}</div>
                    {c.niche && <div className={styles.optionMeta}>{c.niche}</div>}
                  </div>
                  {c.id === value && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
