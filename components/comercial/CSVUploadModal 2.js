/**
 * components/comercial/CSVUploadModal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de upload de CSV. Parser embutido (sem deps externas).
 * Mapper inteligente que detecta colunas pelo header.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SystemModal, { Field, Input, Select } from './SystemModal';
import styles from '../../assets/style/comercialCaptacao.module.css';
import { useNotification } from '../../context/NotificationContext';

const UPLOAD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const TARGET_FIELDS = [
  { key: 'company_name',   label: 'Empresa *',     required: true },
  { key: 'phone',          label: 'Telefone',      required: false },
  { key: 'website',        label: 'Site',          required: false },
  { key: 'google_rating',  label: 'Rating',        required: false },
  { key: 'review_count',   label: 'Reviews',       required: false },
  { key: 'address',        label: 'Endereço',      required: false },
  { key: 'city',           label: 'Cidade',        required: false },
  { key: 'state',          label: 'UF',            required: false },
  { key: 'niche',          label: 'Nicho',         required: false },
  { key: 'instagram_handle', label: 'Instagram',   required: false },
];

const HEADER_HINTS = {
  company_name: ['nome', 'empresa', 'company', 'nome empresa', 'razão social', 'razao social', 'fantasia'],
  phone:        ['telefone', 'phone', 'celular', 'whatsapp', 'tel'],
  website:      ['site', 'website', 'url', 'domínio', 'dominio'],
  google_rating:['rating', 'nota', 'avaliação', 'avaliacao', 'estrelas'],
  review_count: ['reviews', 'avaliações', 'avaliacoes', 'qtd reviews', 'review_count'],
  address:      ['endereço', 'endereco', 'address', 'rua', 'logradouro'],
  city:         ['cidade', 'city', 'município', 'municipio'],
  state:        ['estado', 'uf', 'state', 'região', 'regiao'],
  niche:        ['nicho', 'segmento', 'categoria', 'tipo', 'category'],
  instagram_handle: ['instagram', 'insta', 'ig', 'arroba', '@'],
};

// ─── Parser CSV simples (suporta aspas e separadores , ou ;) ──
function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detecta separador
  const sample = lines[0];
  const sep = (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ';' : ',';

  function splitLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'; i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  const headers = splitLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = splitLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
    rows.push(obj);
  }
  return { headers, rows };
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function detectMapping(headers) {
  const mapping = {};
  for (const target of TARGET_FIELDS) {
    const hints = HEADER_HINTS[target.key] || [];
    const found = headers.find(h => {
      const norm = normalize(h);
      return hints.some(hint => norm.includes(normalize(hint)));
    });
    mapping[target.key] = found || '';
  }
  return mapping;
}

export default function CSVUploadModal({ onClose }) {
  const router = useRouter();
  const { notify } = useNotification();

  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState({});
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  function readFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      notify('Envie um arquivo .csv', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = String(e.target.result);
        const result = parseCSV(text);
        if (result.rows.length === 0) {
          notify('CSV vazio ou inválido', 'warning');
          return;
        }
        if (result.rows.length > 1000) {
          notify('Limite de 1000 leads por upload', 'warning');
          return;
        }
        setParsed(result);
        setMapping(detectMapping(result.headers));
        if (!name) setName(file.name.replace(/\.csv$/i, ''));
      } catch (err) {
        notify('Falha ao ler CSV: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleSubmit() {
    if (!parsed) return notify('Importe um CSV primeiro', 'warning');
    if (!mapping.company_name) return notify('Mapeie a coluna "Empresa"', 'warning');

    setSubmitting(true);
    try {
      const leads = parsed.rows.map(row => {
        const out = {};
        for (const target of TARGET_FIELDS) {
          const src = mapping[target.key];
          if (src && row[src] !== undefined) out[target.key] = row[src];
        }
        return out;
      });

      const res = await fetch('/api/comercial/captacao/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, leads }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha');

      notify(`${json.totalLeads} leads importados`, 'success');
      onClose?.();
      router.push(`/dashboard/comercial/captacao/${json.listId}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const previewRows = parsed?.rows.slice(0, 5) || [];

  return (
    <SystemModal
      open
      onClose={onClose}
      icon={UPLOAD_ICON}
      iconVariant="create"
      title="Importar CSV"
      description="Faça upload de até 1000 leads em um único arquivo CSV. Detectamos as colunas automaticamente pelo nome do header."
      size="lg"
      primaryLabel={submitting ? 'Importando...' : `Importar ${parsed?.rows.length || 0} leads`}
      onPrimary={handleSubmit}
      primaryLoading={submitting}
      primaryDisabled={!parsed}
      secondaryLabel={parsed ? 'Trocar arquivo' : 'Cancelar'}
      onSecondary={parsed ? () => setParsed(null) : onClose}
    >
      {!parsed ? (
        <div
          className={`${styles.dropArea} ${dragActive ? styles.dropAreaActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); readFile(e.dataTransfer.files?.[0]); }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 8, color: 'var(--brand-500)' }}>↑</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            Arraste seu arquivo CSV ou clique para selecionar
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Suporta separadores , e ; · UTF-8
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => readFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <>
          <Field label="Nome da lista" required>
            <Input
              value={name}
              placeholder="Ex: Restaurantes Joinville Janeiro"
              onChange={e => setName(e.target.value)}
            />
          </Field>

          <Field label="Mapeamento de colunas" hint="Cada campo do sistema é mapeado para uma coluna do seu CSV">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TARGET_FIELDS.map(t => (
                <div key={t.key} style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.04em',
                  }}>{t.label}</span>
                  <Select
                    value={mapping[t.key] || ''}
                    onChange={e => setMapping(m => ({ ...m, [t.key]: e.target.value }))}
                  >
                    <option value="">— ignorar —</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          </Field>

          <Field label="Preview (primeiras 5 linhas)" hint={`${parsed.rows.length} linhas no total`}>
            <div className={styles.csvPreview}>
              <table>
                <thead>
                  <tr>
                    {TARGET_FIELDS.filter(t => mapping[t.key]).map(t => (
                      <th key={t.key}>{t.label.replace(' *', '')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {TARGET_FIELDS.filter(t => mapping[t.key]).map(t => (
                        <td key={t.key}>{r[mapping[t.key]] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Field>
        </>
      )}
    </SystemModal>
  );
}
