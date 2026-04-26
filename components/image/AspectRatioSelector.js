/**
 * components/image/AspectRatioSelector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Chips de aspect ratio. Default vem do formato selecionado; mudar manualmente
 * vira "custom".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/style/imageWorkspace.module.css';

const RATIOS = [
  { id: '1:1',   label: '1:1',  w: 14, h: 14, hint: 'Quadrado — Instagram feed, posts' },
  { id: '9:16',  label: '9:16', w: 8,  h: 14, hint: 'Vertical — Stories, Reels, TikTok' },
  { id: '16:9',  label: '16:9', w: 18, h: 10, hint: 'Horizontal — banner, capa de YouTube' },
  { id: '4:5',   label: '4:5',  w: 11, h: 14, hint: 'Retrato — Instagram feed otimizado' },
  { id: '3:2',   label: '3:2',  w: 16, h: 11, hint: 'Paisagem clássica — fotografia, blog' },
];

export default function AspectRatioSelector({ value, onChange }) {
  return (
    <div className={styles.chipRow} role="radiogroup" aria-label="Aspect ratio">
      {RATIOS.map(r => {
        const active = value === r.id;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            onClick={() => onChange(r.id)}
            className={styles.chip}
            title={r.hint}
          >
            <span
              className={styles.chipShape}
              style={{ width: r.w, height: r.h }}
              aria-hidden="true"
            />
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export { RATIOS };
