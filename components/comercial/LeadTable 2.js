/**
 * components/comercial/LeadTable.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tabela densa de leads com bulk select.
 * Sorting client-side. Sigma score com barra visual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from 'react';
import styles from '../../assets/style/leadTable.module.css';

const COLUMNS = [
  { key: 'company_name',  label: 'Empresa',   sortable: true },
  { key: 'phone',         label: 'Telefone',  sortable: false },
  { key: 'website',       label: 'Site',      sortable: false },
  { key: 'google_rating', label: 'Rating',    sortable: true, align: 'right' },
  { key: 'review_count',  label: 'Reviews',   sortable: true, align: 'right' },
  { key: 'city',          label: 'Cidade/UF', sortable: true },
  { key: 'sigma_score',   label: 'Score',     sortable: true, align: 'right' },
];

function shortUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

export default function LeadTable({ leads, selectedIds, onToggleSelect, onSelectAll, onDeselectAll }) {
  const [sortBy, setSortBy] = useState({ key: 'sigma_score', dir: 'desc' });
  const [filterScore, setFilterScore] = useState(0);
  const [filterHasWebsite, setFilterHasWebsite] = useState('all'); // 'all'|'sim'|'nao'

  const filtered = useMemo(() => {
    let arr = leads;
    if (filterScore > 0) arr = arr.filter(l => Number(l.sigma_score || 0) >= filterScore);
    if (filterHasWebsite === 'sim') arr = arr.filter(l => !!l.has_website);
    if (filterHasWebsite === 'nao') arr = arr.filter(l => !l.has_website);
    return arr;
  }, [leads, filterScore, filterHasWebsite]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy;
    arr.sort((a, b) => {
      const va = a[key]; const vb = b[key];
      const na = va == null ? -Infinity : (typeof va === 'number' ? va : String(va).toLowerCase());
      const nb = vb == null ? -Infinity : (typeof vb === 'number' ? vb : String(vb).toLowerCase());
      if (na < nb) return dir === 'asc' ? -1 : 1;
      if (na > nb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'desc' });
  }

  const allSelected = selectedIds.size > 0 && filtered.every(l => selectedIds.has(l.id));

  return (
    <div>
      {/* Filtros */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <span>SCORE MÍN.</span>
          <input type="range" min="0" max="100" value={filterScore}
                 onChange={e => setFilterScore(Number(e.target.value))} />
          <span style={{ minWidth: 30, textAlign: 'right', color: 'var(--text-primary)' }}>{filterScore}</span>
        </div>
        <div className={styles.filterGroup}>
          <span>SITE</span>
          <select className="sigma-input" style={{ width: 120, padding: '6px 8px', fontSize: '0.78rem' }}
                  value={filterHasWebsite}
                  onChange={e => setFilterHasWebsite(e.target.value)}>
            <option value="all">Todos</option>
            <option value="sim">Tem</option>
            <option value="nao">Sem</option>
          </select>
        </div>
        <div className={styles.smallMuted}>
          {filtered.length} de {leads.length} leads
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    className={styles.cb}
                    checked={allSelected}
                    onChange={() => allSelected ? onDeselectAll() : onSelectAll(filtered.map(l => l.id))}
                  />
                </th>
                {COLUMNS.map(c => (
                  <th
                    key={c.key}
                    className={c.sortable ? styles.sortable : ''}
                    style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                    onClick={() => c.sortable && toggleSort(c.key)}
                  >
                    {c.label}
                    {c.sortable && sortBy.key === c.key && (
                      <span className={styles.sortArrow}>{sortBy.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const selected = selectedIds.has(l.id);
                return (
                  <tr key={l.id} className={selected ? styles.rowSelected : ''}>
                    <td className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        className={styles.cb}
                        checked={selected}
                        onChange={() => onToggleSelect(l.id)}
                      />
                    </td>
                    <td className={styles.companyCell}>
                      {l.company_name}
                      {l.imported_to_pipeline && <span className={styles.smallMuted} style={{ marginLeft: 8 }}>· no pipeline</span>}
                    </td>
                    <td>{l.phone || '—'}</td>
                    <td>
                      {l.website
                        ? <a href={l.website.startsWith('http') ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer" className={styles.linkText}>{shortUrl(l.website)}</a>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{l.google_rating != null ? Number(l.google_rating).toFixed(1) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{l.review_count ?? 0}</td>
                    <td>{l.city ? `${l.city}${l.state ? '/' + l.state : ''}` : (l.state || '—')}</td>
                    <td>
                      <div className={styles.scoreCell} style={{ justifyContent: 'flex-end' }}>
                        <div className={styles.scoreBar}>
                          <div className={styles.scoreBarFill}
                               style={{ width: `${Math.max(2, Math.min(100, Number(l.sigma_score || 0)))}%` }} />
                        </div>
                        <span className={styles.scoreNumber}>{l.sigma_score ?? 0}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhum lead encontrado
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
