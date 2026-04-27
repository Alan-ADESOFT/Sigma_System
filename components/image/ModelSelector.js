/**
 * components/image/ModelSelector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dropdown custom de modelos. Cada modelo tem nome, descrição em itálico,
 * badge de custo ($/$$/$$$), badge de velocidade (raios) e flag de habilitado.
 * Modelos disabled aparecem acinzentados com tooltip.
 *
 * mode ou heurística decide).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

// Lineup v1.1 + opção 'auto'. Modelos antigos seguem suportados via
// compat reversa no backend, mas não aparecem aqui (jobs antigos no
// histórico continuam abrindo).
const MODELS = [
  {
    id: 'auto',
    name: 'Auto',
    desc: 'Sistema escolhe o melhor pra cada tarefa',
    cost: '$',
    speed: 3,
    provider: 'auto',
    requiresKey: null,
    badge: 'smart',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Nano Banana 2',
    desc: 'Multi-imagem (até 14 refs), tipografia, brand work',
    cost: '$',
    speed: 3,
    provider: 'gemini',
    requiresKey: 'has_gemini_key',
    badge: 'novo',
  },
  {
    id: 'fal-ai/flux-pro/kontext',
    name: 'Flux Kontext Pro',
    desc: 'Preserva pessoa exata da referência',
    cost: '$',
    speed: 2,
    provider: 'fal',
    requiresKey: 'has_fal_key',
    badge: 'pessoa',
  },
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    desc: 'Rápido, segue instrução natural. Sem verificação de organização',
    cost: '$$',
    speed: 3,
    provider: 'openai',
    requiresKey: 'has_openai_key',
    badge: 'edição',
  },
  {
    id: 'imagen-3.0-capability-001',
    name: 'Imagen 3 Capability',
    desc: 'Subject types tipados — exige modelo habilitado no GCP. Use Flux Kontext se der erro.',
    cost: '$',
    speed: 2,
    provider: 'vertex',
    requiresKey: 'has_vertex_credentials',
    badge: 'legacy',
    note: 'instável · até Jun/26',
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    desc: 'Text-to-image puro, mais barato pra ideação',
    cost: '$',
    speed: 3,
    provider: 'vertex',
    requiresKey: 'has_vertex_credentials',
    badge: 'text-only',
  },
];

function SpeedBolts({ count }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }} aria-label={`${count} de 3`}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            opacity: i < count ? 1 : 0.25,
          }}
        >
          <Icon name="zap" size={9} />
        </span>
      ))}
    </span>
  );
}

function Badge({ kind, children }) {
  const colors = {
    smart:    { bg: 'rgba(168, 85, 247, 0.15)', fg: '#a855f7' },
    novo:     { bg: 'rgba(34, 197, 94, 0.15)',  fg: '#22c55e' },
    pessoa:   { bg: 'rgba(255, 0, 51, 0.15)',   fg: '#ff6680' },
    edição:   { bg: 'rgba(59, 130, 246, 0.15)', fg: '#3b82f6' },
    legacy:   { bg: 'rgba(245, 158, 11, 0.15)', fg: '#f59e0b' },
    'text-only': { bg: 'rgba(82, 82, 82, 0.15)', fg: '#a3a3a3' },
  };
  const c = colors[kind] || colors['text-only'];
  return (
    <span style={{
      fontSize: '0.55rem', fontFamily: 'var(--font-mono)',
      padding: '1px 5px', borderRadius: 3,
      background: c.bg, color: c.fg,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{children}</span>
  );
}

export default function ModelSelector({ value, onChange, settings, enabledModels }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Auto sempre disponível. Modelos específicos: precisam estar habilitados +
  // ter chave configurada.
  const enabled = Array.isArray(enabledModels) && enabledModels.length
    ? enabledModels
    : MODELS.filter(m => m.id !== 'auto').map(m => m.id);

  function isAvailable(m) {
    if (m.id === 'auto') return true;
    if (!enabled.includes(m.id)) return false;
    if (!settings) return true;
    if (!m.requiresKey) return true;
    return !!settings[m.requiresKey];
  }

  const current = MODELS.find(m => m.id === value) || MODELS[0];

  return (
    <div className={styles.modelDropdown} ref={ref}>
      <button
        type="button"
        className={styles.modelTrigger}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className={styles.modelTriggerInfo}>
          <div className={styles.modelTriggerLabel}>
            <Icon name="sparkles" size={12} />
            <span>{current.name}</span>
            {current.badge && <Badge kind={current.badge}>{current.badge}</Badge>}
          </div>
          <div className={styles.modelTriggerDesc}>{current.desc}</div>
        </div>
        <Icon name="chevronDown" size={12} />
      </button>

      {open && (
        <div className={styles.modelMenu} role="listbox" aria-label="Modelos disponíveis">
          {MODELS.map(m => {
            const avail = isAvailable(m);
            return (
              <div
                key={m.id}
                role="option"
                aria-selected={value === m.id}
                aria-disabled={!avail}
                title={!avail ? 'Configure a chave em Configurações → Imagem' : (m.note || undefined)}
                onClick={() => {
                  if (!avail) return;
                  onChange(m.id);
                  setOpen(false);
                }}
                className={styles.modelOption}
                style={{ opacity: avail ? 1 : 0.5, cursor: avail ? 'pointer' : 'not-allowed' }}
              >
                <div className={styles.modelOptionTop}>
                  <span className={styles.modelOptionName}>
                    {m.name}
                    {m.badge && <span style={{ marginLeft: 6 }}><Badge kind={m.badge}>{m.badge}</Badge></span>}
                  </span>
                  <span className={styles.modelOptionBadges}>
                    <span>{m.cost}</span>
                    <SpeedBolts count={m.speed} />
                  </span>
                </div>
                <div className={styles.modelOptionDesc}>
                  {m.desc}
                  {m.note && <span style={{ marginLeft: 6, color: '#f59e0b' }}>· {m.note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { MODELS };
