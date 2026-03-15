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
import styles from '../style/dashboard.module.css';
import { useAuth } from '../hooks/useAuth';

/* ─────────────────────────────────────────────────────────────────────────────
   Constantes de layout
───────────────────────────────────────────────────────────────────────────── */
const SIDEBAR_EXPANDED  = 256; // px — sidebar aberta
const SIDEBAR_COLLAPSED = 56;  // px — sidebar recolhida (somente ícones)

/* ─────────────────────────────────────────────────────────────────────────────
   Estrutura de navegação
   Cada seção agrupa rotas por domínio funcional; ícone é chave do objeto ICONS.
───────────────────────────────────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    category: 'PAINEL',
    items: [
      { href: '/dashboard',          label: 'Dashboard',     tag: '01', icon: 'home'     },
    ],
  },
  {
    category: 'SOCIAL MEDIA',
    items: [
      { href: '/dashboard/publish',  label: 'Publicação',    tag: '02', icon: 'send'     },
      { href: '/dashboard/ads',      label: 'Campanhas Ads', tag: '03', icon: 'chart'    },
    ],
  },
  {
    category: 'SISTEMA',
    items: [
      { href: '/dashboard/settings', label: 'Configurações', tag: '04', icon: 'settings' },
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
  send: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" />
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

          {/* Opção: Configurações */}
          <MenuDropdownItem
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
            label="Configurações"
            onClick={() => { setOpen(false); router.push('/dashboard/settings'); }}
          />

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
          {NAV_SECTIONS.map((section, sIdx) => (
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
              {section.items.map(item => {
                const isActive = item.href === '/dashboard'
                  ? router.pathname === '/dashboard'
                  : router.pathname.startsWith(item.href);

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
          ))}
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
    </div>
  );
}
