/**
 * DashboardLayout.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout raiz de todas as páginas autenticadas.
 *
 * Responsabilidades:
 *   · Verificar sessão via useAuth() — redireciona para /login se inválida
 *   · Renderizar sidebar fixa com navegação em categorias
 *   · Sidebar colapsável (256px ↔ 56px) com transição CSS suave
 *   · Topbar com breadcrumb, status SYNC, avatar e menu de opções
 *   · Injetar efeitos visuais globais (scanlines, vignette, circuit-grid)
 *
 * Uso:
 *   <DashboardLayout activeTab="dashboard">
 *     <YourPageContent />
 *   </DashboardLayout>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import styles from '../assets/style/dashboard.module.css';
import { useAuth } from '../hooks/useAuth';
import JarvisOrb from './JarvisOrb';

/* PERF: prefetch do context snapshot do JARVIS ao montar o dashboard.
   Aquece o cache (120s TTL) antes do usuário abrir o orb. */
function useJarvisPrefetch() {
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/jarvis/prefetch').catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, []);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Constantes de layout
───────────────────────────────────────────────────────────────────────────── */
const SIDEBAR_EXPANDED  = 256; // px — sidebar aberta
const SIDEBAR_COLLAPSED = 56;  // px — sidebar recolhida (somente ícones)

/* ─────────────────────────────────────────────────────────────────────────────
   Estrutura de navegação
   Cada seção agrupa rotas por domínio funcional; ícone é chave do objeto ICONS.
───────────────────────────────────────────────────────────────────────────── */
/* ── Hierarquia de cargos ── */
const ROLE_LEVEL = { user: 1, admin: 2, god: 3 };
function hasAccess(userRole, minRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minRole] || 0);
}

/**
 * Verifica se o usuário pode ver determinado item de navegação.
 * - god: acesso total
 * - admin: tudo exceto minRole='god'
 * - user: checa allowedPages do cargo personalizado
 */
function canSeeItem(user, item) {
  if (!user) return false;
  if (user.role === 'god') return true;
  if (user.role === 'admin') return item.minRole !== 'god';
  // role = 'user' → verifica cargo personalizado
  if (!user.allowedPages || !Array.isArray(user.allowedPages)) return false;
  return user.allowedPages.includes(item.href);
}

const NAV_SECTIONS = [
  {
    category: 'PAINEL',
    items: [
      { href: '/dashboard/overview',         label: 'Visão Geral',            tag: '01', icon: 'eye',       minRole: 'user' },
    ],
  },
  {
    category: 'FINANÇAS',
    items: [
      { href: '/dashboard/financeiro',       label: 'Financeiro',             tag: '02', icon: 'chart',     minRole: 'admin' },
    ],
  },
  {
    category: 'ORGANIZAÇÃO',
    items: [
      { href: '/dashboard/productivity',         label: 'Produtividade',         tag: '03', icon: 'barChart',  minRole: 'user' },
      { href: '/dashboard/tasks',                label: 'Tarefas',               tag: '04', icon: 'clipboard', minRole: 'user' },
      { href: '/dashboard/meetings',             label: 'Calendário',            tag: '05', icon: 'calendar',  minRole: 'user' },
      { href: '/dashboard/task-automation',      label: 'Automação',             tag: '06', icon: 'zap',       minRole: 'admin' },
    ],
  },
  {
    category: 'DADOS',
    items: [
      { href: '/dashboard/clients',          label: 'Clientes',               tag: '07', icon: 'users',     minRole: 'user' },
      { href: '/dashboard/database',         label: 'Base de Dados',          tag: '08', icon: 'database',  minRole: 'admin' },
      { href: '/dashboard/indicacoes',       label: 'Indicações',             tag: '09', icon: 'share',     minRole: 'admin' },
    ],
  },
  {
    category: 'AGENTES DE IA',
    items: [
      { href: '/dashboard/tokens',           label: 'Dashboard de Tokens',    tag: '10', icon: 'zap',       minRole: 'admin' },
      { href: '/dashboard/jarvis',           label: 'J.A.R.V.I.S',           tag: '11', icon: 'bot',       minRole: 'admin' },
      { href: '/dashboard/social',           label: 'Gerador de Copy',        tag: '12', icon: 'edit',      minRole: 'admin' },
    ],
  },
  {
    category: 'SOCIAL MEDIA',
    hidden: true,
    items: [
      { href: '/dashboard/social-dashboard', label: 'Dashboarding Social',    tag: '13', icon: 'barChart',  minRole: 'admin' },
      { href: '/dashboard/content-plan',     label: 'Planejamento',           tag: '14', icon: 'list',      minRole: 'admin' },
      { href: '/dashboard/publish',          label: 'Publicar Agora',         tag: '15', icon: 'send',      minRole: 'admin' },
    ],
  },
  {
    category: 'TRÁFEGO',
    hidden: true,
    items: [
      { href: '/dashboard/ads',              label: 'Campanhas Ads',          tag: '16', icon: 'megaphone', minRole: 'admin' },
    ],
  },
  {
    category: 'SISTEMA',
    items: [
      { href: '/dashboard/settings/users',           label: 'Gestão de Usuários',    tag: '17', icon: 'users',     minRole: 'god' },
      { href: '/dashboard/onboarding-config',       label: 'Config. Onboarding',    tag: '18', icon: 'calendar',  minRole: 'god' },
      { href: '/dashboard/settings/pipeline',        label: 'Config. Pipeline',      tag: '19', icon: 'cpu',       minRole: 'god' },
      { href: '/dashboard/settings/copy',            label: 'Config. Copy',          tag: '20', icon: 'edit2',     minRole: 'god' },
      { href: '/dashboard/settings/jarvis',          label: 'Config. Jarvis',        tag: '21', icon: 'bot',       minRole: 'god' },
      { href: '/dashboard/settings/tasks',           label: 'Config. Tarefas',       tag: '22', icon: 'settings',  minRole: 'god' },
      { href: '/dashboard/settings/financeiro',      label: 'Config. Financeiro',    tag: '23', icon: 'chart',     minRole: 'god' },
      { href: '/dashboard/settings/prompt-library',  label: 'Biblioteca de Prompts', tag: '24', icon: 'book',      minRole: 'god' },

    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Ícones SVG inline (evita dependência de biblioteca de ícones)
───────────────────────────────────────────────────────────────────────────── */
const ICONS = {
  home: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  send: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" />
    </svg>
  ),
  megaphone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 22-7z" />
    </svg>
  ),
  chart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="16" />
    </svg>
  ),
  settings: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  barChart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="18" y="3" width="4" height="18" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="2" y="13" width="4" height="8" rx="1" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
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
  clipboard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  database: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  users: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  share: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  brain: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>
    </svg>
  ),
  zap: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  cpu: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  edit2: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  terminal: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  book: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  /* Ícone bot — Jarvis */
  bot: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="9" cy="16" r="1" /><circle cx="15" cy="16" r="1" />
      <path d="M12 2v4" /><path d="M8 7h8" />
    </svg>
  ),
  /* Ícone do botão de colapso — chevron esquerdo */
  chevronLeft: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  /* Ícone do botão de expansão — chevron direito */
  chevronRight: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

/* ─────────────────────────────────────────────────────────────────────────────
   Waveform — barras animadas decorativas
───────────────────────────────────────────────────────────────────────────── */
function Waveform() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 12 }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="animate-wave"
          style={{
            width: 2, height: 12,
            background: '#ff0033', borderRadius: 2,
            transformOrigin: 'bottom',
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${0.9 + i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   UserAvatar — exibe foto do usuário ou círculo com iniciais
───────────────────────────────────────────────────────────────────────────── */
function UserAvatar({ user, size = 28 }) {
  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : 'U';

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid rgba(255,0,51,0.25)',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(255,0,51,0.1)',
      border: '1px solid rgba(255,0,51,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#ff0033', fontWeight: 700 }}>
        {initials}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MenuDropdownItem — item de linha dentro do dropdown de opções
───────────────────────────────────────────────────────────────────────────── */
function MenuDropdownItem({ icon, label, danger, onClick }) {
  const [hovered, setHovered] = useState(false);
  const color = danger
    ? (hovered ? '#ff1a4d' : '#737373')
    : (hovered ? '#f0f0f0' : '#a3a3a3');

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 14px',
        background: hovered
          ? (danger ? 'rgba(255,0,51,0.06)' : 'rgba(255,255,255,0.03)')
          : 'transparent',
        border: 'none', cursor: 'pointer', color,
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
        letterSpacing: '0.04em', textAlign: 'left',
        transition: 'all 0.12s',
      }}
    >
      <span style={{ opacity: 0.8 }}>{icon}</span>
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ThreeDotMenu — botão ⋮ com dropdown de configurações e logout
   Problema clássico resolvido: overflow: visible no container pai (Topbar)
   impede que o dropdown seja cortado pelo glass-card.
───────────────────────────────────────────────────────────────────────────── */
function ThreeDotMenu({ user, logout }) {
  const router          = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef         = useRef(null);

  /* Fecha automaticamente ao clicar fora do componente */
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Botão de abertura */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Menu de opções"
        style={{
          width: 30, height: 30,
          background: open ? 'rgba(255,0,51,0.08)' : 'transparent',
          border: `1px solid ${open ? 'rgba(255,0,51,0.2)' : 'transparent'}`,
          borderRadius: 6,
          cursor: 'pointer',
          color: open ? '#ff0033' : '#525252',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = '#a3a3a3';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#525252';
          }
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5"  r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>

      {/* Painel dropdown — renderiza fora do flow via position:absolute */}
      {open && (
        <div
          className="animate-scale-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 190,
            background: 'linear-gradient(145deg, rgba(17,17,17,0.99), rgba(10,10,10,0.99))',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 16px rgba(255,0,51,0.04)',
            overflow: 'hidden',
            zIndex: 500,
          }}
        >
          {/* Cabeçalho com dados do usuário */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#f0f0f0', fontWeight: 600 }}>
              {user?.name || 'Usuário'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#525252', marginTop: 2 }}>
              {user?.role?.toUpperCase() || 'ADMIN'}
            </div>
          </div>

          {/* Opção: Meu Perfil (todos) */}
          <MenuDropdownItem
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
            label="Meu Perfil"
            onClick={() => { setOpen(false); router.push('/dashboard/profile'); }}
          />

          {/* Opção: Configurações (só god) */}
          {user?.role === 'god' && (
            <MenuDropdownItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
              label="Configurações"
              onClick={() => { setOpen(false); router.push('/dashboard/settings/pipeline'); }}
            />
          )}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />

          {/* Opção: Logout (destrutiva — cor vermelha) */}
          <MenuDropdownItem
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            }
            label="Logout"
            danger
            onClick={() => { setOpen(false); logout(); }}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NotificationBell — sino de notificações com dropdown e polling automático.
   Busca /api/notifications a cada 30s. Mostra badge vermelho com contagem.
   Dropdown com lista de notificações ou "Nenhuma notificação" quando vazio.
───────────────────────────────────────────────────────────────────────────── */
function NotificationBell() {
  const [open, setOpen]                 = useState(false);
  const [tab, setTab]                   = useState('unread'); // 'unread' | 'all'
  const [notifications, setNotifications] = useState([]);
  const [allNotifications, setAllNotifications] = useState([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [loading, setLoading]           = useState(false);
  const dropdownRef                     = useRef(null);

  // Busca notificações não lidas
  async function fetchNotifications() {
    try {
      const res  = await fetch('/api/notifications');
      const json = await res.json();
      if (json.success) {
        setNotifications(json.notifications || []);
        setUnreadCount(json.unreadCount || 0);
      }
    } catch (err) {
      console.error('[ERRO][NotificationBell] Falha ao buscar notificações', err.message);
    }
  }

  // Busca todas as notificações (lidas + não lidas)
  async function fetchAllNotifications() {
    try {
      const res  = await fetch('/api/notifications?filter=all');
      const json = await res.json();
      if (json.success) {
        setAllNotifications(json.notifications || []);
        setUnreadCount(json.unreadCount || 0);
      }
    } catch (err) {
      console.error('[ERRO][NotificationBell] Falha ao buscar todas as notificações', err.message);
    }
  }

  // PERF: polling com visibilitychange — pausa quando aba esta inativa
  useEffect(() => {
    let interval;
    const start = () => { interval = setInterval(fetchNotifications, 30000); };
    const stop  = () => clearInterval(interval);
    const onVisibility = () => {
      if (document.hidden) stop();
      else { fetchNotifications(); start(); }
    };

    fetchNotifications();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Marca uma notificação como lida
  async function markRead(id) {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', id }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setAllNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[ERRO][NotificationBell] Falha ao marcar como lida', err.message);
    }
  }

  // Marca todas como lidas
  async function markAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead' }),
      });
      setNotifications([]);
      setAllNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[ERRO][NotificationBell] Falha ao marcar todas como lidas', err.message);
    }
  }

  // Ícone de tipo da notificação
  function typeIcon(type) {
    if (type === 'form_submitted')               return '✓';
    if (type === 'form_started')                 return '✏';
    if (type === 'form_sent')                    return '📋';
    if (type === 'token_expired')                return '⏱';
    if (type === 'pipeline_done')                return '✓';
    if (type === 'pipeline_failed')              return '✕';
    if (type === 'client_created')               return '+';
    if (type === 'stage_done')                   return '✓';
    if (type === 'database_reset')               return '⟳';
    if (type === 'export_generated')             return '↓';
    // Instagram
    if (type === 'instagram_connected')          return '◉';
    if (type === 'instagram_disconnected')       return '⊘';
    if (type === 'instagram_post_published')     return '✓';
    if (type === 'instagram_post_failed')        return '✕';
    if (type === 'instagram_token_expiring')     return '⏱';
    if (type === 'instagram_token_refresh_failed') return '⚠';
    return '●';
  }

  // Cor do tipo
  function typeColor(type) {
    if (type === 'form_submitted')               return 'var(--success)';
    if (type === 'form_started')                 return 'var(--warning)';
    if (type === 'token_expired')                return 'var(--error)';
    if (type === 'pipeline_done')                return 'var(--success)';
    if (type === 'pipeline_failed')              return 'var(--error)';
    if (type === 'client_created')               return 'var(--info)';
    if (type === 'stage_done')                   return 'var(--success)';
    if (type === 'database_reset')               return 'var(--warning)';
    if (type === 'export_generated')             return 'var(--info)';
    // Instagram
    if (type === 'instagram_connected')          return 'var(--info)';
    if (type === 'instagram_disconnected')       return 'var(--warning)';
    if (type === 'instagram_post_published')     return 'var(--success)';
    if (type === 'instagram_post_failed')        return 'var(--error)';
    if (type === 'instagram_token_expiring')     return 'var(--warning)';
    if (type === 'instagram_token_refresh_failed') return 'var(--error)';
    return 'var(--info)';
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Botão sino */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) fetchNotifications(); }}
        title="Notificações"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: open ? 'rgba(255,0,51,0.12)' : 'rgba(255,0,51,0.06)',
          border: open ? '1px solid rgba(255,0,51,0.25)' : '1px solid rgba(255,0,51,0.12)',
          cursor: 'pointer',
          color: unreadCount > 0 ? 'var(--brand-300)' : 'var(--text-muted)',
          transition: 'all 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Badge de contagem */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 14, height: 14, borderRadius: 7,
            background: 'var(--brand-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700,
            color: '#fff', lineHeight: 1,
            padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0,
          marginTop: 8, width: 340,
          background: 'linear-gradient(145deg, rgba(17,17,17,0.98), rgba(10,10,10,0.99))',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 200,
          animation: 'scaleIn 0.2s ease-out',
        }}>
          {/* Header do dropdown */}
          <div style={{
            padding: '10px 14px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Notificações
              </span>
              {tab === 'unread' && notifications.length > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                    color: 'var(--brand-500)', letterSpacing: '0.04em',
                  }}
                >
                  Limpar todas
                </button>
              )}
            </div>

            {/* Tabs: Não lidas / Todas */}
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { key: 'unread', label: 'Não lidas' },
                { key: 'all',    label: 'Todas' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key);
                    if (t.key === 'all') fetchAllNotifications();
                    else fetchNotifications();
                  }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === t.key
                      ? '2px solid var(--brand-500)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6rem',
                    fontWeight: tab === t.key ? 600 : 400,
                    color: tab === t.key ? 'var(--brand-400)' : 'var(--text-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                  {t.key === 'unread' && unreadCount > 0 && (
                    <span style={{
                      marginLeft: 5,
                      padding: '1px 5px',
                      borderRadius: 8,
                      background: 'rgba(255,0,51,0.15)',
                      color: 'var(--brand-400)',
                      fontSize: '0.5rem',
                      fontWeight: 700,
                    }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {(() => {
              const list = tab === 'all' ? allNotifications : notifications;
              if (list.length === 0) {
                return (
                  <div style={{ padding: '32px 14px', textAlign: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }}>
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                      color: 'var(--text-muted)', letterSpacing: '0.04em',
                    }}>
                      {tab === 'all' ? 'Nenhuma notificação ainda' : 'Nenhuma notificação não lida'}
                    </div>
                  </div>
                );
              }
              return list.map(n => {
                const isRead = n.read;
                return (
                  <div
                    key={n.id}
                    style={{
                      display: 'flex', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      cursor: !isRead ? 'pointer' : 'default',
                      opacity: isRead ? 0.55 : 1,
                      transition: 'background 0.15s, opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => { if (!isRead) markRead(n.id); }}
                    title={isRead ? 'Já lida' : 'Clique para marcar como lida'}
                  >
                    {/* Ícone do tipo */}
                    <div style={{
                      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: `${typeColor(n.type)}15`,
                      border: `1px solid ${typeColor(n.type)}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem',
                    }}>
                      {typeIcon(n.type)}
                    </div>

                    {/* Conteúdo */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                        fontWeight: isRead ? 400 : 600,
                        color: isRead ? 'var(--text-secondary)' : 'var(--text-primary)',
                        marginBottom: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {n.title}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-sans)', fontSize: '0.72rem',
                        color: 'var(--text-secondary)', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {n.message}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.52rem',
                        color: 'var(--text-muted)', marginTop: 4,
                        letterSpacing: '0.04em',
                      }}>
                        {n.company_name && <span>{n.company_name} · </span>}
                        {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Dot de não lida — só aparece se não foi lida */}
                    {!isRead && (
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--brand-500)', flexShrink: 0, marginTop: 4,
                      }} />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Topbar — barra superior com navegação de contexto e controles de usuário
   IMPORTANTE: overflow: 'visible' é necessário para que o dropdown do
   ThreeDotMenu não seja cortado pelo overflow:hidden do .glass-card pai.
───────────────────────────────────────────────────────────────────────────── */
function Topbar({ activeTab, user, logout }) {
  return (
    <div
      className="glass-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 28,
        padding: '12px 16px',          /* topbar levemente mais alto */
        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#525252',
        overflow: 'visible',            /* permite que dropdown sobressaia */
        position: 'relative',
      }}
    >
      {/* Ícone terminal */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff0033" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>

      {/* Breadcrumb de caminho */}
      <span>C:\SIGMA\{activeTab || 'dashboard'}&gt;</span>
      <span className="animate-cursor-blink" style={{ color: '#ff0033' }}>_</span>

      {/* Empurra o restante para a direita */}
      <div style={{ flex: 1 }} />

      {/* Waveform + badge SYNC */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="animate-wave"
              style={{ width: 2, height: 10, background: '#ff0033', borderRadius: 2, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div className="animate-sync-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
          <span className="label-micro" style={{ color: '#22c55e' }}>SYNC</span>
        </div>
      </div>

      {/* Notificações */}
      <NotificationBell />

      {/* Divisor vertical */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', margin: '0 8px' }} />

      {/* Avatar + primeiro nome do usuário */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserAvatar user={user} size={26} />
        <span style={{ color: '#a3a3a3', fontSize: '0.7rem' }}>
          {user?.name?.split(' ')[0] || '...'}
        </span>
      </div>

      {/* Menu de opções */}
      <ThreeDotMenu user={user} logout={logout} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DashboardLayout — componente raiz exportado
───────────────────────────────────────────────────────────────────────────── */
export default function DashboardLayout({ children, activeTab }) {
  const router                        = useRouter();
  const { user, loading, logout }     = useAuth();
  const [time, setTime]               = useState('');
  useJarvisPrefetch();

  /*
   * collapsed — controla o estado da sidebar.
   * true  → 56px  (somente ícones, sem labels)
   * false → 256px (expandida com labels e categorias)
   */
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth  = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const contentMargin = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  /* Relógio em tempo real — atualizado a cada segundo */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime([
        now.getHours().toString().padStart(2, '0'),
        now.getMinutes().toString().padStart(2, '0'),
        now.getSeconds().toString().padStart(2, '0'),
      ].join(':'));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* Tela de verificação de sessão — substitui layout completo enquanto carrega */
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050505',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="hud-scanlines" />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#525252',
        }}>
          <div className="animate-sync-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff0033' }} />
          Verificando sessão...
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.appLayout} circuit-grid`}>
      <div className="hud-scanlines" />
      <div className="hud-vignette" />

      {/* ────────────────────────────────────────────────
          SIDEBAR
      ──────────────────────────────────────────────── */}
      <aside
        className={styles.sidebar}
        style={{ width: sidebarWidth }}
      >
        {/* Linha de destaque na borda direita (efeito HUD) */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 1,
          background: 'linear-gradient(180deg, transparent, rgba(255,0,51,0.15) 30%, rgba(255,0,51,0.15) 70%, transparent)',
          zIndex: 1,
        }} />

        {/* ── Cabeçalho: logo + botão de colapso ── */}
        <div className={styles.sidebarHeader}>
          {/* Logo — ícone sempre visível; texto some quando recolhido */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            overflow: 'hidden', flex: 1,
            minWidth: 0,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 7,
              background: 'rgba(255,0,51,0.06)',
              border: '1px solid rgba(255,0,51,0.25)',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <img src="/logo.ranca.png" alt="SIGMA" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            </div>

            {/* Labels do header — ocultas quando recolhido */}
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: '#f0f0f0', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  SIGMA
                </div>
                <div className="label-micro" style={{ marginTop: 3, whiteSpace: 'nowrap' }}>Terminal v1.0</div>
              </div>
            )}
          </div>

          {/* Botão de colapso/expansão */}
          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            style={{
              width: 24, height: 24, flexShrink: 0,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 5,
              cursor: 'pointer', color: '#3a3a3a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
              marginLeft: collapsed ? 0 : 4,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = '#a3a3a3';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#3a3a3a';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
            }}
          >
            {collapsed ? ICONS.chevronRight : ICONS.chevronLeft}
          </button>
        </div>

        {/* ── Navegação em categorias ── */}
        <nav className={styles.sidebarNav}>
          {NAV_SECTIONS.filter(s => !s.hidden).map((section, sIdx) => {
            const visibleItems = section.items.filter(item => canSeeItem(user, item));
            if (visibleItems.length === 0) return null;
            return (
            <div key={section.category}>
              {/*
               * Rótulo de categoria — só aparece quando sidebar está expandida.
               * Quando recolhida, mantemos apenas um separador visual mínimo.
               */}
              {!collapsed ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: `${sIdx === 0 ? '4px' : '12px'} 8px 6px`,
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
                    fontWeight: 700, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: '#3a3a3a',
                    whiteSpace: 'nowrap',
                  }}>
                    {section.category}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                </div>
              ) : (
                sIdx !== 0 && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '8px 4px' }} />
                )
              )}

              {/* Links individuais da seção */}
              {visibleItems.map(item => {
                // Match exato OU prefixo seguido de "/" — evita que /dashboard/social
                // case com /dashboard/social-dashboard
                const isActive = item.href === '/dashboard'
                  ? router.pathname === '/dashboard'
                  : router.pathname === item.href || router.pathname.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.sidebarLink}
                    title={collapsed ? item.label : undefined}  /* tooltip quando recolhido */
                    style={{
                      background: isActive ? 'rgba(255,0,51,0.06)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(255,0,51,0.12)' : 'transparent'}`,
                      color: isActive ? '#f0f0f0' : '#525252',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      padding: collapsed ? '9px 0' : '9px 8px',
                    }}
                  >
                    {/* Indicador de ativo — barra vertical vermelha à esquerda */}
                    {isActive && (
                      <div className="animate-nav-glow" style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: 2, height: 16, borderRadius: 2, background: '#ff0033',
                      }} />
                    )}

                    {/* Tag numérica — oculta quando recolhido */}
                    {!collapsed && (
                      <span className="label-micro" style={{
                        width: 20, flexShrink: 0,
                        color: isActive ? 'rgba(255,0,51,0.6)' : undefined,
                      }}>
                        {item.tag}
                      </span>
                    )}

                    {/* Ícone — sempre visível; centralizado quando recolhido */}
                    <span style={{ color: isActive ? '#ff0033' : '#525252', flexShrink: 0 }}>
                      {ICONS[item.icon]}
                    </span>

                    {/* Label — oculta quando recolhido */}
                    {!collapsed && (
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        fontWeight: 500, letterSpacing: '0.04em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            );
          })}
        </nav>

        {/* ── Footer da sidebar — visível apenas quando expandida ── */}
        {!collapsed && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="animate-sync-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <span className="label-micro" style={{ color: '#22c55e' }}>LIVE</span>
              </div>
              <Waveform />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#525252', fontVariantNumeric: 'tabular-nums' }}>
              {time}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 5, color: '#525252' }}>●</span>
              <span className="label-micro">v1.0 · SIGMA DS</span>
            </div>
          </div>
        )}

        {/* Footer compacto quando recolhido — apenas dot de status */}
        {collapsed && (
          <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <div className="animate-sync-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
          </div>
        )}

        {/* HUD tags decorativas */}
        <div style={{ position: 'absolute', top: 8, right: 10 }}>
          <span className="label-micro" style={{ opacity: 0.3 }}>◇</span>
        </div>
      </aside>

      {/* ────────────────────────────────────────────────
          CONTEÚDO PRINCIPAL
          marginLeft segue a largura da sidebar com transição suave
      ──────────────────────────────────────────────── */}
      <main
        className={styles.mainContent}
        style={{ marginLeft: contentMargin }}
      >
        <Topbar activeTab={activeTab} user={user} logout={logout} />
        {children}
      </main>

      {/* ── ORB flutuante do Jarvis — aparece em todas as páginas ── */}
      <JarvisOrb userName={user?.name} />
    </div>
  );
}
