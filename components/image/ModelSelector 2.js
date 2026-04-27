/**
 * components/image/ModelSelector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dropdown custom de modelos. Cada modelo tem nome, descrição em itálico,
 * badge de custo ($/$$/$$$), badge de velocidade (raios) e flag de habilitado.
 * Modelos disabled aparecem acinzentados com tooltip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

const MODELS = [
  {
    id: 'imagen-4',
    name: 'Imagen 4',
    desc: 'Realismo + tipografia. Ótimo pra brand.',
    cost: '$',
    speed: 2,
    provider: 'vertex',
    requiresKey: 'has_vertex_credentials',
  },
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    desc: 'Rápido, segue instrução natural.',
    cost: '$$',
    speed: 3,
    provider: 'openai',
    requiresKey: 'has_openai_key',
  },
  {
    id: 'flux-1.1-pro',
    name: 'Flux 1.1 Pro',
    desc: 'Editorial cinematográfico.',
    cost: '$$',
    speed: 2,
    provider: 'fal',
    requiresKey: 'has_fal_key',
  },
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    desc: 'Mais barato, ótimo pra ideação.',
    cost: '$',
    speed: 3,
    provider: 'gemini',
    requiresKey: 'has_gemini_key',
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

export default function ModelSelector({ value, onChange, settings, enabledModels }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Click outside
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const enabled = Array.isArray(enabledModels) && enabledModels.length
    ? enabledModels
    : MODELS.map(m => m.id);

  function isAvailable(m) {
    if (!enabled.includes(m.id)) return false;
    if (!settings) return true;
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
                title={!avail ? 'Configure a chave em Config. Imagem' : undefined}
                onClick={() => {
                  if (!avail) return;
                  onChange(m.id);
                  setOpen(false);
                }}
                className={styles.modelOption}
              >
                <div className={styles.modelOptionTop}>
                  <span className={styles.modelOptionName}>{m.name}</span>
                  <span className={styles.modelOptionBadges}>
                    <span>{m.cost}</span>
                    <SpeedBolts count={m.speed} />
                  </span>
                </div>
                <div className={styles.modelOptionDesc}>{m.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { MODELS };
