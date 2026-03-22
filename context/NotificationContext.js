/**
 * context/NotificationContext.js
 * Sistema global de notificações toast.
 * Seguindo o brandbook SIGMA: dark, vermelho, JetBrains Mono, glass-card.
 *
 * Uso:
 *   const { notify } = useNotification();
 *   notify('Mensagem', 'success' | 'error' | 'warning' | 'info', duração_ms?)
 *   notify('Mensagem', 'success', { onClick: fn })           // toast clicável
 *   notify('Mensagem', 'info', { action: { label: 'Ver', onClick: fn } }) // com botão
 *   notify('Mensagem', 'success', { duration: 8000 })        // duração custom
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const NotificationContext = createContext(null);

/* ── Hook público ── */
export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification: use dentro de <NotificationProvider>');
  return ctx;
}

/* ── Configuração visual por tipo ── */
const TYPE_CFG = {
  success: {
    color:  '#22c55e',
    bg:     'rgba(34,197,94,0.07)',
    label:  'SUCESSO',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  error: {
    color:  '#ff1a4d',
    bg:     'rgba(255,26,77,0.07)',
    label:  'ERRO',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
  },
  warning: {
    color:  '#f97316',
    bg:     'rgba(249,115,22,0.07)',
    label:  'AVISO',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    color:  '#3b82f6',
    bg:     'rgba(59,130,246,0.07)',
    label:  'INFO',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

/* ── Item individual de notificação ── */
function NotificationItem({ notification, onClose }) {
  const cfg = TYPE_CFG[notification.type] || TYPE_CFG.info;
  const barRef = useRef(null);

  /* Barra de progresso do auto-dismiss */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !notification.duration) return;
    bar.style.transition = `width ${notification.duration}ms linear`;
    /* Força reflow para a transição funcionar */
    bar.getBoundingClientRect();
    bar.style.width = '0%';
  }, [notification.duration]);

  const isClickable = !!notification.onClick;
  const action = notification.action; // { label, onClick }

  function handleToastClick() {
    if (notification.onClick) {
      notification.onClick();
      onClose();
    }
  }

  return (
    <div
      className="animate-scale-in"
      onClick={isClickable ? handleToastClick : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 12px 16px 0',
        background: 'linear-gradient(145deg, rgba(15,15,15,0.99), rgba(10,10,10,0.99))',
        border: '1px solid rgba(255,255,255,0.05)',
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: '0 8px 8px 0',
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${cfg.color}18`,
        width: 320,
        maxWidth: 'calc(100vw - 40px)',
        overflow: 'hidden',
        cursor: isClickable ? 'pointer' : 'default',
      }}
    >
      {/* Glow de fundo */}
      <div style={{
        position: 'absolute', inset: 0,
        background: cfg.bg,
        pointerEvents: 'none',
      }} />

      {/* Ícone */}
      <div style={{
        flexShrink: 0,
        width: 30, height: 30,
        borderRadius: 6,
        background: `${cfg.color}14`,
        border: `1px solid ${cfg.color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: cfg.color,
        position: 'relative', zIndex: 1,
        marginLeft: 12, marginTop: 1,
      }}>
        {cfg.icon}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1, minWidth: 0 }}>
        {/* Tipo */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.58rem',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: cfg.color,
          marginBottom: 4,
        }}>
          {cfg.label}
        </div>

        {/* Mensagem + ação inline */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            flex: 1,
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.8rem',
            color: '#d4d4d4',
            lineHeight: 1.45,
          }}>
            {notification.message}
          </div>
          {action && (
            <button
              onClick={(e) => { e.stopPropagation(); action.onClick(); onClose(); }}
              style={{
                flexShrink: 0,
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${cfg.color}40`,
                background: `${cfg.color}14`,
                color: cfg.color,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.56rem',
                fontWeight: 600,
                cursor: 'pointer',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>

      {/* Botão fechar */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          flexShrink: 0,
          background: 'none', border: 'none',
          cursor: 'pointer', color: '#525252',
          display: 'flex', alignItems: 'center',
          padding: '2px 10px 0 4px',
          transition: 'color 0.15s',
          position: 'relative', zIndex: 1,
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#a3a3a3'}
        onMouseLeave={e => e.currentTarget.style.color = '#525252'}
        aria-label="Fechar notificação"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Barra de progresso de auto-dismiss */}
      <div
        ref={barRef}
        style={{
          position: 'absolute',
          bottom: 0, left: 0,
          height: 2,
          width: '100%',
          background: cfg.color,
          opacity: 0.5,
          borderRadius: '0 0 8px 0',
        }}
      />
    </div>
  );
}

/* ── Provider ── */
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  /* Durações default por tipo */
  const DEFAULT_DURATIONS = { success: 4000, error: 6000, warning: 4500, info: 4500 };

  /* Adiciona notificação e agenda remoção
   * opts pode ser:
   *   número → duração em ms
   *   objeto → { duration?, onClick?, action?: { label, onClick } }
   */
  const notify = useCallback((message, type = 'info', opts) => {
    let duration, onClick, action;
    if (typeof opts === 'number') {
      duration = opts;
    } else if (opts && typeof opts === 'object') {
      duration = opts.duration;
      onClick = opts.onClick;
      action = opts.action;
    }
    duration = duration || DEFAULT_DURATIONS[type] || 4500;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications(prev => [...prev, { id, message, type, duration, onClick, action }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration + 300); /* pequeno buffer para animação de saída */
  }, []);

  /* Fecha manualmente */
  const close = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}

      {/* Container fixo — canto superior direito */}
      <div
        role="region"
        aria-label="Notificações"
        style={{
          position: 'fixed',
          top: 20, right: 20,
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {notifications.map(n => (
          <div key={n.id} style={{ pointerEvents: 'auto' }}>
            <NotificationItem
              notification={n}
              onClose={() => close(n.id)}
            />
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
