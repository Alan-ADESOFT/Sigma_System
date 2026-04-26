/**
 * components/comercial/CaptacaoFiltersForm.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal de filtros para iniciar uma captação Apify (padrão SIGMA).
 * Submete em POST /api/comercial/captacao/jobs e redireciona pro detalhe da lista.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import SystemModal, {
  Field, Input, Select, Row2, Row21, SectionTitle,
} from './SystemModal';
import filterStyles from '../../assets/style/comercialCaptacao.module.css';
import { useNotification } from '../../context/NotificationContext';
import { UFS } from './inputMasks';

const SEARCH_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const NICHE_SUGGESTIONS = [
  'Restaurante', 'Construtora', 'Clínica', 'Academia', 'Loja',
  'Salão de Beleza', 'Pet Shop', 'Advocacia', 'Imobiliária', 'Mercado',
];

const QTY_OPTIONS = [50, 100, 250, 500, 1000];

export default function CaptacaoFiltersForm({ onClose }) {
  const router = useRouter();
  const { notify } = useNotification();

  const [niche, setNiche] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [minRating, setMinRating]   = useState(0);
  const [minReviews, setMinReviews] = useState(0);
  const [hasWebsite, setHasWebsite] = useState('indiferente');
  const [maxLeads, setMaxLeads]     = useState(100);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const errs = {};
    if (!niche.trim()) errs.niche = 'Informe o nicho';
    if (!state)        errs.state = 'Selecione o estado';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/comercial/captacao/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${niche} ${city || ''} ${state}`.trim().replace(/\s+/g, ' '),
          filters: {
            niche: niche.trim(),
            state,
            city: city.trim() || null,
            minRating: Number(minRating),
            minReviews: Number(minReviews),
            hasWebsite,
            maxLeads: Number(maxLeads),
          },
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        notify(json.error || 'Falha ao iniciar captação', 'error');
        setSubmitting(false);
        return;
      }

      notify('Captação iniciada — roda em segundo plano. Você pode fechar a aba e voltar depois.', 'success', { duration: 6000 });
      onClose?.();
      router.push(`/dashboard/comercial/captacao/${json.listId}`);
    } catch (err) {
      console.error('[CaptacaoFiltersForm] submit', err);
      notify('Erro de rede ao iniciar captação', 'error');
      setSubmitting(false);
    }
  }

  return (
    <SystemModal
      open
      onClose={onClose}
      icon={SEARCH_ICON}
      iconVariant="create"
      title="Nova captação de leads"
      description="Define os filtros e dispara um scraping no Google Maps via Apify. A captação roda em segundo plano — você pode fechar essa aba e voltar depois."
      size="md"
      primaryLabel={submitting ? 'Iniciando...' : 'Iniciar captação'}
      onPrimary={handleSubmit}
      primaryLoading={submitting}
      secondaryLabel="Cancelar"
    >
      <Field label="Nicho" required error={errors.niche}>
        <Input
          autoFocus
          value={niche}
          placeholder="Ex: Restaurante, Construtora..."
          onChange={e => { setNiche(e.target.value); if (errors.niche) setErrors(p => ({ ...p, niche: null })); }}
        />
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {NICHE_SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setNiche(s)}
              className={`${filterStyles.suggestionChip} ${niche === s ? filterStyles.suggestionChipActive : ''}`}
            >{s}</button>
          ))}
        </div>
      </Field>

      <Row21>
        <Field label="Cidade (opcional)">
          <Input
            value={city}
            placeholder="Ex: Joinville"
            onChange={e => setCity(e.target.value)}
          />
        </Field>
        <Field label="UF" required error={errors.state}>
          <Select
            value={state}
            onChange={e => { setState(e.target.value); if (errors.state) setErrors(p => ({ ...p, state: null })); }}
          >
            <option value="">—</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
      </Row21>

      <SectionTitle>Filtros (opcional)</SectionTitle>

      <Field label={`Nota mínima Google: ${Number(minRating).toFixed(1)}`}>
        <input
          type="range"
          min="0" max="5" step="0.1"
          value={minRating}
          onChange={e => setMinRating(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--brand-500)' }}
        />
      </Field>

      <Field label={`Reviews mínimas: ${minReviews}`}>
        <input
          type="range"
          min="0" max="500" step="5"
          value={minReviews}
          onChange={e => setMinReviews(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--brand-500)' }}
        />
      </Field>

      <Field label="Tem site?">
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: 'indiferente', l: 'Indiferente' },
            { v: 'sim',         l: 'Tem site'    },
            { v: 'nao',         l: 'Sem site'    },
          ].map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => setHasWebsite(o.v)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 4,
                background: hasWebsite === o.v ? 'rgba(255, 0, 51, 0.08)' : 'transparent',
                color: hasWebsite === o.v ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: hasWebsite === o.v ? '1px solid rgba(255, 0, 51, 0.30)' : '1px solid var(--border-default)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >{o.l}</button>
          ))}
        </div>
      </Field>

      <Field label="Quantidade de leads">
        <Select value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))}>
          {QTY_OPTIONS.map(q => <option key={q} value={q}>{q} leads</option>)}
        </Select>
      </Field>
    </SystemModal>
  );
}
