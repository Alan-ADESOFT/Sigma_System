/**
 * pages/dashboard/indicacoes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel admin do sistema de indicação.
 *
 * Tem 3 abas:
 *   1. Indicações  → tabela com todas as indicações + filtros + stats cards
 *   2. Config      → editor da página de venda (VSL, oferta, checkout)
 *   3. Mensagens   → textos editáveis (modal de copy + WhatsApp)
 *
 * O topo da página tem 4 stats cards (total, acessos, compras, conversão)
 * que se atualizam quando a aba "Indicações" carrega a lista.
 *
 * APIs:
 *   GET  /api/referral/list                  → todas indicações do tenant
 *   GET  /api/referral/admin/config          → config completa
 *   PUT  /api/referral/admin/config          → upsert
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/indicacao.module.css';

const STATUS_FILTERS = [
  { value: '',                 label: 'Todas' },
  { value: 'link_created',     label: 'Aguardando' },
  { value: 'page_visited',     label: 'Acessou' },
  { value: 'video_started',    label: 'Assistindo' },
  { value: 'video_completed',  label: 'Assistiu' },
  { value: 'purchased',        label: 'Comprou' },
];

/* ═══════════════════════════════════════════════════════════
   Ícones inline pra tabs e stats
═══════════════════════════════════════════════════════════ */

const ICONS = {
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  config: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  message: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  totalReferrals: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  visited: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  purchased: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  conversion: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
};

/* ═══════════════════════════════════════════════════════════
   PÁGINA — orquestrador de tabs + stats
═══════════════════════════════════════════════════════════ */

export default function IndicacoesPage() {
  const { notify } = useNotification();
  const [tab, setTab] = useState('list');
  const [allReferrals, setAllReferrals] = useState([]);

  // Stats são calculados a partir da lista completa (sem filtro)
  const stats = computeStats(allReferrals);

  return (
    <DashboardLayout activeTab="indicacoes">
      <div>
        {/* ── HEADER ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Indicações</h1>
          <p className="page-subtitle">
            Cada cliente que termina o onboarding ganha um link único pra
            indicar um amigo. Acompanhe o funil completo aqui.
          </p>
        </div>

        {/* ── STATS CARDS ── */}
        <div className={styles.statsGrid}>
          <StatCard
            icon={ICONS.totalReferrals}
            label="Links gerados"
            value={stats.total}
            tone="default"
          />
          <StatCard
            icon={ICONS.visited}
            label="Acessaram"
            value={stats.visited}
            sub={stats.total ? `${Math.round((stats.visited / stats.total) * 100)}%` : '—'}
            tone="warn"
          />
          <StatCard
            icon={ICONS.purchased}
            label="Compraram"
            value={stats.purchased}
            sub={stats.total ? `${Math.round((stats.purchased / stats.total) * 100)}%` : '—'}
            tone="success"
          />
          <StatCard
            icon={ICONS.conversion}
            label="Receita"
            value={`R$ ${stats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            tone="primary"
          />
        </div>

        {/* ── TABS ── */}
        <div className={styles.adminTabs}>
          <button
            className={`${styles.adminTab} ${tab === 'list' ? styles.active : ''}`}
            onClick={() => setTab('list')}
          >
            <span className={styles.adminTabIcon}>{ICONS.list}</span>
            Indicações
          </button>
          <button
            className={`${styles.adminTab} ${tab === 'config' ? styles.active : ''}`}
            onClick={() => setTab('config')}
          >
            <span className={styles.adminTabIcon}>{ICONS.config}</span>
            Config Página
          </button>
          <button
            className={`${styles.adminTab} ${tab === 'messages' ? styles.active : ''}`}
            onClick={() => setTab('messages')}
          >
            <span className={styles.adminTabIcon}>{ICONS.message}</span>
            Mensagens
          </button>
          <button
            className={`${styles.adminTab} ${tab === 'test' ? styles.active : ''}`}
            onClick={() => setTab('test')}
          >
            <span className={styles.adminTabIcon}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </span>
            Teste
          </button>
        </div>

        {/* ── CONTEÚDO DA TAB ── */}
        {tab === 'list'     && <ReferralListTab notify={notify} onLoaded={setAllReferrals} />}
        {tab === 'config'   && <ReferralConfigTab notify={notify} />}
        {tab === 'messages' && <ReferralMessagesTab notify={notify} />}
        {tab === 'test'     && <ReferralTestTab notify={notify} />}
      </div>
    </DashboardLayout>
  );
}

/* ─── Helper: calcula stats agregados a partir do array de indicações ─── */
function computeStats(arr) {
  const total = arr.length;
  let visited = 0;
  let purchased = 0;
  let revenue = 0;

  // Status que contam como "acessou" (qualquer coisa após link_created)
  const accessedStatuses = new Set([
    'page_visited', 'video_started', 'video_completed', 'purchased',
  ]);

  for (const r of arr) {
    if (accessedStatuses.has(r.status)) visited++;
    if (r.status === 'purchased') {
      purchased++;
      revenue += Number(r.purchaseValue || 0);
    }
  }

  return { total, visited, purchased, revenue };
}

/* ═══════════════════════════════════════════════════════════
   STAT CARD — bloco de estatística no topo
═══════════════════════════════════════════════════════════ */

function StatCard({ icon, label, value, sub, tone = 'default' }) {
  return (
    <div className={`${styles.statCard} ${styles[`tone_${tone}`] || ''}`}>
      <div className={styles.statCardIcon}>{icon}</div>
      <div className={styles.statCardLabel}>{label}</div>
      <div className={styles.statCardValueRow}>
        <div className={styles.statCardValue}>{value}</div>
        {sub && <div className={styles.statCardSub}>{sub}</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 1 — LISTA DE INDICAÇÕES
═══════════════════════════════════════════════════════════ */

function ReferralListTab({ notify, onLoaded }) {
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState([]);
  const [filter, setFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const url = filter
        ? `/api/referral/list?status=${encodeURIComponent(filter)}`
        : '/api/referral/list';
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao carregar', 'error');
        return;
      }
      const list = data.referrals || [];
      setReferrals(list);

      // Pra alimentar os stats cards do topo, sempre busca a lista completa
      // (sem filtro) — quando filtro tá ativo, faz uma chamada adicional.
      if (filter) {
        const allRes = await fetch('/api/referral/list');
        const allData = await allRes.json();
        if (allData.success && typeof onLoaded === 'function') {
          onLoaded(allData.referrals || []);
        }
      } else if (typeof onLoaded === 'function') {
        onLoaded(list);
      }
    } catch (err) {
      notify('Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  function statusBadge(status) {
    const map = {
      link_created:    { label: 'AGUARDANDO',  cls: 'created' },
      page_visited:    { label: 'ACESSOU',     cls: 'visited' },
      video_started:   { label: 'ASSISTINDO',  cls: 'video' },
      video_completed: { label: 'ASSISTIU',    cls: 'completed' },
      purchased:       { label: 'COMPROU',     cls: 'purchased' },
    };
    const info = map[status] || { label: status, cls: 'created' };
    return (
      <span className={`${styles.adminStatusBadge} ${styles[info.cls] || ''}`}>
        {info.label}
      </span>
    );
  }

  function formatDate(d) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className={styles.adminFilters}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value || 'all'}
            className={`${styles.adminFilterChip} ${filter === f.value ? styles.active : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="skeleton" style={{ height: 200 }} />}

      {!loading && referrals.length === 0 && (
        <div className={styles.adminEmpty}>
          Nenhuma indicação encontrada{filter ? ' com esse filtro' : ' ainda'}.
        </div>
      )}

      {!loading && referrals.length > 0 && (
        <div className={styles.adminTableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Cliente que indicou</th>
                <th>Indicado</th>
                <th>Status</th>
                <th>Vídeo</th>
                <th>Visita</th>
                <th>Compra</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {r.referrerName || '—'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      #{r.refCode}
                    </div>
                  </td>
                  <td>
                    {r.referredName || (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td>{statusBadge(r.status)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {r.videoProgress}%
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {formatDate(r.firstAccessAt)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {r.purchasedAt ? (
                      <span style={{ color: '#22c55e' }}>
                        {formatDate(r.purchasedAt)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 2 — CONFIG DA PÁGINA DE VENDA
   Dividida em seções: Vídeo, Oferta, Acesso, Checkout, Status.
═══════════════════════════════════════════════════════════ */

function ReferralConfigTab({ notify }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vslVideoUrl:        '',
    vslVideoDuration:   240,
    offerRevealAt:      210,
    offerPrice:         997,
    offerOriginal:      5000,
    offerInstallments:  12,
    timerHours:         72,
    checkoutUrl:        '',
    pageActive:         true,
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/referral/admin/config');
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao carregar config', 'error');
        return;
      }
      if (data.config) {
        setForm({
          vslVideoUrl:        data.config.vslVideoUrl || '',
          vslVideoDuration:   data.config.vslVideoDuration || 240,
          offerRevealAt:      data.config.offerRevealAt ?? 210,
          offerPrice:         data.config.offerPrice || 997,
          offerOriginal:      data.config.offerOriginal || 5000,
          offerInstallments:  data.config.offerInstallments || 12,
          timerHours:         data.config.timerHours || 72,
          checkoutUrl:        data.config.checkoutUrl || '',
          pageActive:         data.config.pageActive ?? true,
        });
      }
    } catch (err) {
      notify('Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/referral/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao salvar', 'error');
        return;
      }
      notify('Config salva', 'success', 2500);
    } catch (err) {
      notify('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  }

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Preview de parcela calculado client-side
  const installmentValue = form.offerInstallments > 0
    ? (Number(form.offerPrice) / Number(form.offerInstallments)).toFixed(2)
    : '0.00';

  if (loading) return <div className="skeleton" style={{ height: 300 }} />;

  return (
    <div className={styles.configForm}>

      {/* ── SEÇÃO VÍDEO ── */}
      <ConfigSection title="Vídeo de Venda (VSL)" subtitle="O vídeo principal da página secreta + tempo pra revelar a oferta">
        <div className={styles.configFormRow}>
          <label className={styles.configFormLabel}>URL da VSL</label>
          <input
            type="text"
            className={styles.configFormInput}
            value={form.vslVideoUrl}
            onChange={e => update('vslVideoUrl', e.target.value)}
            placeholder="YouTube, Vimeo, Panda, MP4..."
          />
        </div>

        <div className={styles.configFormGrid}>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Duração total (segundos)</label>
            <input
              type="number"
              className={styles.configFormInput}
              value={form.vslVideoDuration}
              onChange={e => update('vslVideoDuration', parseInt(e.target.value, 10) || 0)}
            />
            <div className={styles.configHelp}>tempo total do vídeo</div>
          </div>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Revelar oferta em (segundos)</label>
            <input
              type="number"
              className={styles.configFormInput}
              value={form.offerRevealAt}
              onChange={e => update('offerRevealAt', parseInt(e.target.value, 10) || 0)}
            />
            <div className={styles.configHelp}>quando o CTA aparece (ex: 210 = 3:30)</div>
          </div>
        </div>
      </ConfigSection>

      {/* ── SEÇÃO OFERTA ── */}
      <ConfigSection title="Oferta" subtitle="Preço, parcelas e valor riscado">
        <div className={styles.configFormGrid}>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Preço atual (R$)</label>
            <input
              type="number"
              step="0.01"
              className={styles.configFormInput}
              value={form.offerPrice}
              onChange={e => update('offerPrice', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Preço riscado (R$)</label>
            <input
              type="number"
              step="0.01"
              className={styles.configFormInput}
              value={form.offerOriginal}
              onChange={e => update('offerOriginal', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className={styles.configFormGrid}>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Parcelas</label>
            <input
              type="number"
              className={styles.configFormInput}
              value={form.offerInstallments}
              onChange={e => update('offerInstallments', parseInt(e.target.value, 10) || 1)}
            />
          </div>
          <div className={styles.configFormRow}>
            <label className={styles.configFormLabel}>Preview da parcela</label>
            <input
              type="text"
              readOnly
              className={styles.configFormInput}
              value={`${form.offerInstallments}x R$ ${installmentValue}`}
              style={{ color: 'var(--text-muted)' }}
            />
          </div>
        </div>
      </ConfigSection>

      {/* ── SEÇÃO ACESSO ── */}
      <ConfigSection title="Acesso" subtitle="Quanto tempo o link fica vivo após o primeiro acesso">
        <div className={styles.configFormRow}>
          <label className={styles.configFormLabel}>Timer de acesso (horas)</label>
          <input
            type="number"
            className={styles.configFormInput}
            value={form.timerHours}
            onChange={e => update('timerHours', parseInt(e.target.value, 10) || 0)}
            style={{ maxWidth: 200 }}
          />
          <div className={styles.configHelp}>
            72h = padrão · só começa a contar quando o indicado abre o link
          </div>
        </div>
      </ConfigSection>

      {/* ── SEÇÃO CHECKOUT ── */}
      <ConfigSection title="Checkout" subtitle="Pra onde o botão vermelho da página leva">
        <div className={styles.configFormRow}>
          <label className={styles.configFormLabel}>URL do checkout (Stripe / Kiwify)</label>
          <input
            type="text"
            className={styles.configFormInput}
            value={form.checkoutUrl}
            onChange={e => update('checkoutUrl', e.target.value)}
            placeholder="https://checkout.stripe.com/..."
          />
        </div>
      </ConfigSection>

      {/* ── SEÇÃO STATUS ── */}
      <ConfigSection title="Status" subtitle="Liga ou desliga a página de venda">
        <label className={styles.configToggleLabel}>
          <input
            type="checkbox"
            checked={form.pageActive}
            onChange={e => update('pageActive', e.target.checked)}
          />
          <span>
            Página de venda <strong>{form.pageActive ? 'ATIVA' : 'INATIVA'}</strong>
          </span>
        </label>
      </ConfigSection>

      <button
        className={styles.configSaveBtn}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  );
}

/* ─── Helper component: seção do form com título e divider ─── */
function ConfigSection({ title, subtitle, children }) {
  return (
    <div className={styles.configSection}>
      <div className={styles.configSectionHeader}>
        <div className={styles.configSectionDot} />
        <div>
          <div className={styles.configSectionTitle}>{title}</div>
          {subtitle && <div className={styles.configSectionSubtitle}>{subtitle}</div>}
        </div>
      </div>
      <div className={styles.configSectionBody}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB 3 — MENSAGENS EDITÁVEIS
   Textos que o cliente vê quando indica alguém:
   - Modal mostrado ao copiar o link
   - Mensagem pré-preenchida do WhatsApp ({LINK} é substituído)
═══════════════════════════════════════════════════════════ */

function ReferralMessagesTab({ notify }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyWarningMessage, setCopyWarningMessage] = useState('');
  const [whatsappMessage,    setWhatsappMessage]    = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/referral/admin/config');
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao carregar', 'error');
        return;
      }
      setCopyWarningMessage(data.config?.copyWarningMessage || '');
      setWhatsappMessage(data.config?.whatsappMessage || '');
    } catch (err) {
      notify('Erro de conexão', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/referral/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copyWarningMessage,
          whatsappMessage,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        notify(data.error || 'Erro ao salvar', 'error');
        return;
      }
      notify('Mensagens salvas', 'success', 2500);
    } catch (err) {
      notify('Erro de conexão', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 300 }} />;

  return (
    <div className={styles.configForm}>

      <ConfigSection
        title="Aviso ao copiar link"
        subtitle="Modal que aparece quando o cliente clica em 'Copiar' na tela de conclusão do onboarding"
      >
        <div className={styles.configFormRow}>
          <label className={styles.configFormLabel}>Texto do modal</label>
          <textarea
            className={styles.configFormTextarea}
            value={copyWarningMessage}
            onChange={e => setCopyWarningMessage(e.target.value)}
            rows={5}
            placeholder="ATENÇÃO: esse link é único e exclusivo..."
          />
          <div className={styles.configHelp}>
            Aparece num modal de tela cheia com botão "Entendi". Use pra avisar
            sobre o limite de 72h e pedir pra não distribuir em massa.
          </div>
        </div>

        <div className={styles.messagePreview}>
          <div className={styles.messagePreviewLabel}>// PREVIEW</div>
          <div className={styles.messagePreviewContent}>
            {copyWarningMessage || <em style={{ color: 'var(--text-muted)' }}>Sem mensagem definida — vai usar o padrão</em>}
          </div>
        </div>
      </ConfigSection>

      <ConfigSection
        title="Mensagem do WhatsApp"
        subtitle="Texto pré-preenchido quando o cliente clica em 'Enviar por WhatsApp'"
      >
        <div className={styles.configFormRow}>
          <label className={styles.configFormLabel}>Template da mensagem</label>
          <textarea
            className={styles.configFormTextarea}
            value={whatsappMessage}
            onChange={e => setWhatsappMessage(e.target.value)}
            rows={5}
            placeholder="Fala! Tô num processo com a Sigma..."
          />
          <div className={styles.configHelp}>
            Use <code className={styles.configCode}>{'{LINK}'}</code> onde o link de indicação deve aparecer. O sistema substitui automático.
          </div>
        </div>

        <div className={styles.messagePreview}>
          <div className={styles.messagePreviewLabel}>// PREVIEW (com link de exemplo)</div>
          <div className={styles.messagePreviewContent}>
            {whatsappMessage
              ? whatsappMessage.replace(/\{LINK\}/g, 'https://app.sigma/indicacao/abc123')
              : <em style={{ color: 'var(--text-muted)' }}>Sem mensagem definida — vai usar o padrão</em>
            }
          </div>
        </div>
      </ConfigSection>

      <button
        className={styles.configSaveBtn}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Salvando...' : 'Salvar Mensagens'}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TAB: TESTE — gera links temporários para validar o funil
═══════════════════════════════════════════════════════════ */
function ReferralTestTab({ notify }) {
  const [label, setLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [testLinks, setTestLinks] = useState([]);
  const [expiring, setExpiring] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await fetch('/api/referral/generate-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || 'Teste' }),
      });
      const d = await r.json();
      if (!d.success) { notify(d.error || 'Erro ao gerar link.', 'error'); return; }
      setTestLinks(prev => [d.referral, ...prev]);
      setLabel('');
      notify('Link de teste gerado.', 'success');
    } catch {
      notify('Erro de conexão.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function copyLink(link) {
    navigator.clipboard?.writeText(link);
    notify('Link copiado.', 'success');
  }

  async function handleDelete(refCode) {
    if (!confirm('Deletar este link de teste?')) return;
    setDeleting(refCode);
    try {
      const r = await fetch('/api/referral/generate-test', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode }),
      });
      const d = await r.json();
      if (d.success) {
        setTestLinks(prev => prev.filter(tl => tl.refCode !== refCode));
        notify('Link deletado.', 'success');
      } else { notify(d.error || 'Erro.', 'error'); }
    } catch { notify('Erro de conexão.', 'error'); }
    setDeleting(null);
  }

  async function handleExpire(refCode) {
    setExpiring(refCode);
    try {
      const r = await fetch('/api/referral/simulate-expire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode }),
      });
      const d = await r.json();
      if (d.success) {
        notify('Link expirado. Abra o link para ver a animação.', 'success');
        setTestLinks(prev => prev.map(tl => tl.refCode === refCode ? { ...tl, expired: true } : tl));
      } else {
        notify(d.error || 'Erro.', 'error');
      }
    } catch { notify('Erro de conexão.', 'error'); }
    setExpiring(null);
  }

  const inputStyle = {
    flex: 1, padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6, color: '#f0f0f0',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', outline: 'none',
  };

  return (
    <div>
      {/* Aviso */}
      <div style={{
        padding: '14px 18px', borderRadius: 8, marginBottom: 20,
        background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'rgba(255,200,100,0.85)', lineHeight: 1.75 }}>
          <strong style={{ color: '#ffaa00', display: 'block', marginBottom: 4 }}>Modo de Teste</strong>
          Links gerados aqui funcionam exatamente como links reais — o indicado vai ver a página de venda,
          o timer de 72h, o VSL e a oferta. Use para validar o funil antes de ativar para clientes.
          Links de teste ficam marcados com "[TESTE]" na aba Indicações.
        </div>
      </div>

      {/* Gerador */}
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--brand-500, #ff0033)', marginBottom: 14,
        }}>
          Gerar Link de Teste
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            style={inputStyle}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nome do teste (ex: Teste VSL, Teste Mobile...)"
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '10px 20px', borderRadius: 6, flexShrink: 0,
              cursor: generating ? 'not-allowed' : 'pointer',
              background: generating ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.9)',
              border: 'none', color: '#fff',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
              letterSpacing: '0.06em', opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? 'Gerando...' : 'Gerar Link'}
          </button>
        </div>
      </div>

      {/* Lista de links gerados */}
      {testLinks.length > 0 && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-muted)', marginBottom: 14,
          }}>
            Links Gerados ({testLinks.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {testLinks.map(tl => (
              <div key={tl.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#f0f0f0', fontWeight: 600 }}>
                    {tl.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)',
                    marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {tl.refLink}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(tl.refLink)}
                  title="Copiar link"
                  style={{
                    padding: '6px 14px', borderRadius: 5, flexShrink: 0,
                    cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  Copiar
                </button>
                <a
                  href={tl.refLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 14px', borderRadius: 5, flexShrink: 0,
                    textDecoration: 'none', border: '1px solid rgba(255,0,51,0.2)',
                    background: 'rgba(255,0,51,0.05)', color: '#ff6680',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                    transition: 'all 0.15s',
                  }}
                >
                  Abrir
                </a>
                <button
                  onClick={() => handleExpire(tl.refCode)}
                  disabled={expiring === tl.refCode || tl.expired}
                  title="Simula expiração de 72h para testar a tela"
                  style={{
                    padding: '6px 14px', borderRadius: 5, flexShrink: 0,
                    cursor: (expiring === tl.refCode || tl.expired) ? 'not-allowed' : 'pointer',
                    border: tl.expired ? '1px solid rgba(255,170,0,0.15)' : '1px solid rgba(255,170,0,0.25)',
                    background: tl.expired ? 'rgba(255,170,0,0.03)' : 'rgba(255,170,0,0.06)',
                    color: tl.expired ? '#665520' : '#ffaa00',
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                    transition: 'all 0.15s',
                    opacity: tl.expired ? 0.5 : 1,
                  }}
                >
                  {tl.expired ? 'Expirado' : expiring === tl.refCode ? '...' : 'Simular 72h'}
                </button>
                <button
                  onClick={() => handleDelete(tl.refCode)}
                  disabled={deleting === tl.refCode}
                  title="Deletar link de teste"
                  style={{
                    padding: '6px 10px', borderRadius: 5, flexShrink: 0,
                    cursor: deleting === tl.refCode ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.02)',
                    color: '#737373', fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ff0033'; e.currentTarget.style.borderColor = 'rgba(255,0,51,0.2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#737373'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                  {deleting === tl.refCode ? '...' : '✕'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
