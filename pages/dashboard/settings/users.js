/**
 * pages/dashboard/settings/users.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Gestão de Usuários + Cargos Personalizados — acessível apenas por god.
 * Tab 1: Lista, cria, edita e desativa membros da equipe.
 * Tab 2: Cria e edita cargos com permissões de página granulares.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../context/NotificationContext';

/* ── Constantes de estilo ── */
const ROLE_LABELS = { god: 'GOD', admin: 'ADMIN', user: 'USER' };
const ROLE_COLORS = {
  god:   { bg: 'rgba(255,0,51,0.12)', color: '#ff0033', border: 'rgba(255,0,51,0.3)' },
  admin: { bg: 'rgba(255,170,0,0.1)', color: '#ffaa00', border: 'rgba(255,170,0,0.25)' },
  user:  { bg: 'rgba(100,200,255,0.08)', color: '#64c8ff', border: 'rgba(100,200,255,0.2)' },
};

/** Todas as páginas configuráveis para cargos personalizados */
const ALL_PAGES = [
  { href: '/dashboard/overview',             label: 'Visão Geral',            category: 'PAINEL' },
  { href: '/dashboard/financeiro',           label: 'Financeiro',             category: 'FINANÇAS' },
  { href: '/dashboard/productivity',         label: 'Produtividade',          category: 'ORGANIZAÇÃO' },
  { href: '/dashboard/tasks',                label: 'Tarefas',                category: 'ORGANIZAÇÃO' },
  { href: '/dashboard/meetings',             label: 'Calendário',             category: 'ORGANIZAÇÃO' },
  { href: '/dashboard/task-automation',      label: 'Automação',              category: 'ORGANIZAÇÃO' },
  { href: '/dashboard/comercial/dashboard',  label: 'Dashboard Comercial',    category: 'COMERCIAL' },
  { href: '/dashboard/comercial/captacao',   label: 'Lista de Captação',      category: 'COMERCIAL' },
  { href: '/dashboard/comercial/pipeline',   label: 'Status da Captação',     category: 'COMERCIAL' },
  { href: '/dashboard/comercial/propostas',  label: 'Gerador de Propostas',   category: 'COMERCIAL' },
  { href: '/dashboard/clients',              label: 'Clientes',               category: 'DADOS' },
  { href: '/dashboard/database',             label: 'Base de Dados',          category: 'DADOS' },
  { href: '/dashboard/indicacoes',           label: 'Indicações',             category: 'DADOS' },
  { href: '/dashboard/tokens',               label: 'Dashboard de Tokens',    category: 'AGENTES DE IA' },
  { href: '/dashboard/jarvis',               label: 'J.A.R.V.I.S',            category: 'AGENTES DE IA' },
  { href: '/dashboard/social',               label: 'Gerador de Copy',        category: 'AGENTES DE IA' },
  { href: '/dashboard/image',                label: 'Gerador de Imagem',      category: 'AGENTES DE IA' },
  { href: '/dashboard/social-dashboard',     label: 'Dashboarding Social',    category: 'SOCIAL MEDIA' },
  { href: '/dashboard/content-planning',     label: 'Planejamento Editorial', category: 'SOCIAL MEDIA' },
  { href: '/dashboard/content-plan',         label: 'Calendário Editorial',   category: 'SOCIAL MEDIA' },
  { href: '/dashboard/publish',              label: 'Publicar Agora',         category: 'SOCIAL MEDIA' },
  { href: '/dashboard/ads',                  label: 'Campanhas Ads',          category: 'TRÁFEGO' },
  { href: '/dashboard/ads/relatorios',       label: 'Relatórios Públicos',    category: 'TRÁFEGO' },
];

/** Agrupa páginas por categoria para renderização */
function groupByCategory(pages) {
  const groups = {};
  pages.forEach(p => {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  });
  return groups;
}

/* ── Componentes auxiliares ── */
function RoleBadge({ role, customName }) {
  if (role === 'user' && customName) {
    return (
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
        letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4,
        background: 'rgba(100,200,255,0.08)', color: '#64c8ff', border: '1px solid rgba(100,200,255,0.2)',
      }}>
        {customName.toUpperCase()}
      </span>
    );
  }
  const c = ROLE_COLORS[role] || ROLE_COLORS.user;
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
      letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 4,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {ROLE_LABELS[role] || role?.toUpperCase()}
    </span>
  );
}

function UserInitials({ user, size = 32 }) {
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : 'U';
  if (user?.avatar_url) {
    return <img src={user.avatar_url} alt={user.name} style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border: '1px solid rgba(255,0,51,0.2)',
    }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#ff0033', fontWeight: 700 }}>
        {initials}
      </span>
    </div>
  );
}

/* ── Estilos reutilizáveis ── */
const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6, color: '#f0f0f0',
  fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
  outline: 'none', transition: 'border-color 0.15s',
};
const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 4, display: 'block',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const { notify: addNotification } = useNotification();
  const [tab, setTab] = useState('users'); // 'users' | 'roles'

  // ── Estado: Usuários ──
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userModal, setUserModal] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', username: '', password: '', phone: '', role: 'user', custom_role_id: '', is_active: true });

  // ── Estado: Cargos ──
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [roleModal, setRoleModal] = useState(null);
  const [savingRole, setSavingRole] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [rolePages, setRolePages] = useState([]);

  /* ── Fetch ── */
  const fetchUsers = useCallback(async () => {
    try { const r = await fetch('/api/users'); const d = await r.json(); if (d.success) setUsers(d.users || []); } catch {}
    setLoadingUsers(false);
  }, []);

  const fetchRoles = useCallback(async () => {
    try { const r = await fetch('/api/users/roles'); const d = await r.json(); if (d.success) setRoles(d.roles || []); } catch {}
    setLoadingRoles(false);
  }, []);

  useEffect(() => { fetchUsers(); fetchRoles(); }, [fetchUsers, fetchRoles]);

  /* ── Handlers: Usuários ── */
  function openCreateUser() {
    setUserForm({ name: '', email: '', username: '', password: '', phone: '', role: 'user', custom_role_id: roles[0]?.id || '', is_active: true });
    setUserModal({ mode: 'create' });
  }
  function openEditUser(u) {
    setUserForm({ name: u.name, email: u.email, username: u.username || '', password: '', phone: u.phone || '', role: u.role, custom_role_id: u.custom_role_id || '', is_active: u.is_active });
    setUserModal({ mode: 'edit', user: u });
  }
  async function handleSaveUser() {
    setSavingUser(true);
    try {
      const payload = { ...userForm };
      if (payload.role === 'user' && payload.custom_role_id) {
        // envia custom_role_id junto
      } else {
        payload.custom_role_id = null;
      }
      if (userModal.mode === 'create') {
        if (!payload.name || !payload.email || !payload.password) {
          addNotification('Preencha nome, email e senha.', 'error'); setSavingUser(false); return;
        }
        const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (!d.success) { addNotification(d.error, 'error'); setSavingUser(false); return; }
        addNotification(`Usuário ${d.user.name} criado.`, 'success');
      } else {
        if (!payload.password) delete payload.password;
        const r = await fetch(`/api/users/${userModal.user.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (!d.success) { addNotification(d.error, 'error'); setSavingUser(false); return; }
        addNotification(`Usuário ${d.user.name} atualizado.`, 'success');
      }
      setUserModal(null); fetchUsers();
    } catch { addNotification('Erro de conexão.', 'error'); }
    setSavingUser(false);
  }
  async function handleDeactivate(u) {
    if (!confirm(`Desativar ${u.name}?`)) return;
    try {
      const r = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (d.success) { addNotification(`${u.name} desativado.`, 'success'); fetchUsers(); }
      else addNotification(d.error, 'error');
    } catch {}
  }
  async function handleReactivate(u) {
    try {
      const r = await fetch(`/api/users/${u.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
      const d = await r.json();
      if (d.success) { addNotification(`${u.name} reativado.`, 'success'); fetchUsers(); }
    } catch {}
  }

  /* ── Handlers: Cargos ── */
  function openCreateRole() {
    setRoleName(''); setRolePages(['/dashboard/overview', '/dashboard/tasks']);
    setRoleModal({ mode: 'create' });
  }
  function openEditRole(role) {
    setRoleName(role.name);
    setRolePages(Array.isArray(role.allowed_pages) ? role.allowed_pages : JSON.parse(role.allowed_pages || '[]'));
    setRoleModal({ mode: 'edit', role });
  }
  function togglePage(href) {
    setRolePages(prev => prev.includes(href) ? prev.filter(p => p !== href) : [...prev, href]);
  }
  function toggleCategory(cat) {
    const catPages = ALL_PAGES.filter(p => p.category === cat).map(p => p.href);
    const allSelected = catPages.every(h => rolePages.includes(h));
    if (allSelected) setRolePages(prev => prev.filter(p => !catPages.includes(p)));
    else setRolePages(prev => [...new Set([...prev, ...catPages])]);
  }
  async function handleSaveRole() {
    if (!roleName.trim()) { addNotification('Nome do cargo é obrigatório.', 'error'); return; }
    setSavingRole(true);
    try {
      if (roleModal.mode === 'create') {
        const r = await fetch('/api/users/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: roleName, allowed_pages: rolePages }) });
        const d = await r.json();
        if (!d.success) { addNotification(d.error, 'error'); setSavingRole(false); return; }
        addNotification(`Cargo "${d.role.name}" criado.`, 'success');
      } else {
        const r = await fetch('/api/users/roles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: roleModal.role.id, name: roleName, allowed_pages: rolePages }) });
        const d = await r.json();
        if (!d.success) { addNotification(d.error, 'error'); setSavingRole(false); return; }
        addNotification(`Cargo "${d.role.name}" atualizado.`, 'success');
      }
      setRoleModal(null); fetchRoles();
    } catch { addNotification('Erro de conexão.', 'error'); }
    setSavingRole(false);
  }
  async function handleDeleteRole(role) {
    if (!confirm(`Remover cargo "${role.name}"? Usuários vinculados perderão suas permissões.`)) return;
    try {
      const r = await fetch('/api/users/roles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: role.id }) });
      const d = await r.json();
      if (d.success) { addNotification(d.message, 'success'); fetchRoles(); fetchUsers(); }
      else addNotification(d.error, 'error');
    } catch {}
  }

  /* ── Proteção frontend ── */
  if (me && me.role !== 'god') {
    return (
      <DashboardLayout activeTab="settings/users">
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="section-title">Acesso restrito</p>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: 8 }}>
            Apenas o administrador God pode acessar esta página.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const groups = groupByCategory(ALL_PAGES);

  return (
    <DashboardLayout activeTab="settings/users">
      <div className="animate-fade-in-up" style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">Gestão de Usuários</h1>
          <p className="page-subtitle">Gerencie membros da equipe e configure cargos com permissões personalizadas.</p>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ id: 'users', label: 'Usuários' }, { id: 'roles', label: 'Cargos' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 20px', cursor: 'pointer', background: 'transparent', border: 'none',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
              letterSpacing: '0.08em', color: tab === t.id ? '#ff0033' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid #ff0033' : '2px solid transparent',
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ═══════════════ TAB: USUÁRIOS ═══════════════ */}
        {tab === 'users' && (
          <>
            <button onClick={openCreateUser} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', marginBottom: 20,
              background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)', borderRadius: 6,
              cursor: 'pointer', color: '#ff0033', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              fontWeight: 600, letterSpacing: '0.06em',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Adicionar Usuário
            </button>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {loadingUsers ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>Carregando...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['', 'Nome', 'Email', 'Cargo', 'Status', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const customRole = roles.find(r => r.id === u.custom_role_id);
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '10px 14px', width: 48 }}><UserInitials user={u} /></td>
                          <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#f0f0f0', fontWeight: 500 }}>
                            {u.name}
                            {u.username && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.65rem' }}>@{u.username}</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                          <td style={{ padding: '10px 14px' }}><RoleBadge role={u.role} customName={customRole?.name} /></td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600, color: u.is_active ? '#22c55e' : '#737373' }}>
                              {u.is_active ? 'ATIVO' : 'INATIVO'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {u.role !== 'god' && (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button onClick={() => openEditUser(u)} title="Editar" style={{ width: 28, height: 28, borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#737373', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; }} onMouseLeave={e => { e.currentTarget.style.color = '#737373'; }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                                </button>
                                {u.is_active ? (
                                  <button onClick={() => handleDeactivate(u)} title="Desativar" style={{ width: 28, height: 28, borderRadius: 5, background: 'rgba(255,0,51,0.04)', border: '1px solid rgba(255,0,51,0.15)', cursor: 'pointer', color: '#737373', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#ff0033'; }} onMouseLeave={e => { e.currentTarget.style.color = '#737373'; }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
                                  </button>
                                ) : (
                                  <button onClick={() => handleReactivate(u)} title="Reativar" style={{ width: 28, height: 28, borderRadius: 5, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer', color: '#737373', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#22c55e'; }} onMouseLeave={e => { e.currentTarget.style.color = '#737373'; }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ═══════════════ TAB: CARGOS ═══════════════ */}
        {tab === 'roles' && (
          <>
            <button onClick={openCreateRole} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', marginBottom: 20,
              background: 'rgba(255,0,51,0.08)', border: '1px solid rgba(255,0,51,0.25)', borderRadius: 6,
              cursor: 'pointer', color: '#ff0033', fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              fontWeight: 600, letterSpacing: '0.06em',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Novo Cargo
            </button>

            <div style={{ display: 'grid', gap: 12 }}>
              {loadingRoles ? (
                <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>Carregando...</div>
              ) : roles.length === 0 ? (
                <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  Nenhum cargo personalizado criado. Crie cargos como "Designer", "Videomaker", etc.
                </div>
              ) : roles.map(role => {
                const pages = Array.isArray(role.allowed_pages) ? role.allowed_pages : JSON.parse(role.allowed_pages || '[]');
                return (
                  <div key={role.id} className="glass-card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f0f0f0', fontWeight: 600 }}>
                          {role.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 10 }}>
                          {pages.length} página(s) — {role.user_count || 0} usuário(s)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEditRole(role)} title="Editar" style={{ width: 28, height: 28, borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#737373', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f0'; }} onMouseLeave={e => { e.currentTarget.style.color = '#737373'; }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                        </button>
                        <button onClick={() => handleDeleteRole(role)} title="Remover" style={{ width: 28, height: 28, borderRadius: 5, background: 'rgba(255,0,51,0.04)', border: '1px solid rgba(255,0,51,0.15)', cursor: 'pointer', color: '#737373', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ff0033'; }} onMouseLeave={e => { e.currentTarget.style.color = '#737373'; }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                        </button>
                      </div>
                    </div>
                    {/* Lista de páginas liberadas */}
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {pages.map(href => {
                        const pg = ALL_PAGES.find(p => p.href === href);
                        return (
                          <span key={href} style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                            padding: '2px 6px', borderRadius: 3,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                            color: 'var(--text-secondary)',
                          }}>
                            {pg?.label || href}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ═══════════════ MODAL: CRIAR/EDITAR USUÁRIO ═══════════════ */}
      {userModal && (
        <div onClick={() => setUserModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: 480, padding: '28px 24px' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>
              {userModal.mode === 'create' ? 'Novo Usuário' : `Editar ${userModal.user?.name}`}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input style={inputStyle} value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Username</label>
                  <input style={inputStyle} value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} placeholder="@username" />
                </div>
                <div>
                  <label style={labelStyle}>Telefone</label>
                  <input style={inputStyle} value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} placeholder="(99) 99999-9999" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{userModal.mode === 'create' ? 'Senha' : 'Nova Senha (vazio = manter)'}</label>
                <input style={inputStyle} type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={userForm.role === 'god' ? 'admin' : userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="admin">Admin (acesso completo)</option>
                    <option value="user">Cargo personalizado</option>
                  </select>
                </div>
                {userForm.role === 'user' && (
                  <div>
                    <label style={labelStyle}>Cargo</label>
                    <select style={{ ...inputStyle, cursor: 'pointer' }} value={userForm.custom_role_id} onChange={e => setUserForm(f => ({ ...f, custom_role_id: e.target.value }))}>
                      <option value="">— Selecione —</option>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {userModal.mode === 'edit' && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={userForm.is_active ? 'true' : 'false'} onChange={e => setUserForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setUserModal(null)} style={{ padding: '8px 18px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleSaveUser} disabled={savingUser} style={{ padding: '8px 18px', borderRadius: 6, cursor: savingUser ? 'not-allowed' : 'pointer', background: savingUser ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.9)', border: 'none', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, opacity: savingUser ? 0.6 : 1 }}>
                {savingUser ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ MODAL: CRIAR/EDITAR CARGO ═══════════════ */}
      {roleModal && (
        <div onClick={() => setRoleModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: 560, padding: '28px 24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>
              {roleModal.mode === 'create' ? 'Novo Cargo' : `Editar "${roleModal.role?.name}"`}
            </h2>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Nome do Cargo</label>
              <input style={inputStyle} value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="Ex: Designer, Videomaker, Social Media" />
            </div>

            <div>
              <label style={{ ...labelStyle, marginBottom: 12 }}>Páginas Liberadas</label>
              {Object.entries(groups).map(([cat, pages]) => {
                const allSelected = pages.every(p => rolePages.includes(p.href));
                const someSelected = pages.some(p => rolePages.includes(p.href));
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    {/* Header da categoria com toggle */}
                    <button
                      onClick={() => toggleCategory(cat)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                        background: 'transparent', border: 'none', padding: '4px 0',
                        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
                        letterSpacing: '0.12em', color: allSelected ? '#ff0033' : someSelected ? '#ffaa00' : 'var(--text-muted)',
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${allSelected ? '#ff0033' : 'rgba(255,255,255,0.15)'}`,
                        background: allSelected ? 'rgba(255,0,51,0.15)' : 'transparent',
                      }}>
                        {allSelected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        {!allSelected && someSelected && <span style={{ width: 6, height: 2, background: '#ffaa00', borderRadius: 1 }} />}
                      </span>
                      {cat}
                    </button>
                    {/* Checkboxes individuais */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginLeft: 22, marginTop: 4 }}>
                      {pages.map(pg => {
                        const checked = rolePages.includes(pg.href);
                        return (
                          <label key={pg.href} style={{
                            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                            color: checked ? '#f0f0f0' : 'var(--text-muted)', padding: '3px 0',
                          }}>
                            <input
                              type="checkbox" checked={checked} onChange={() => togglePage(pg.href)}
                              style={{ accentColor: '#ff0033', width: 13, height: 13, cursor: 'pointer' }}
                            />
                            {pg.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setRoleModal(null)} style={{ padding: '8px 18px', borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600 }}>Cancelar</button>
              <button onClick={handleSaveRole} disabled={savingRole} style={{ padding: '8px 18px', borderRadius: 6, cursor: savingRole ? 'not-allowed' : 'pointer', background: savingRole ? 'rgba(255,0,51,0.3)' : 'rgba(255,0,51,0.9)', border: 'none', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, opacity: savingRole ? 0.6 : 1 }}>
                {savingRole ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
