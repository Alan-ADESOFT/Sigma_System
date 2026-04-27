/**
 * components/image/FormatSelector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cards de formato com label, aspect ratio e descrição contextual.
 * Cada formato JÁ define o aspect ratio — só "Custom" expõe seleção manual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import styles from '../../assets/style/imageWorkspace.module.css';

const FORMATS = [
  { id: 'square_post', label: 'Post',        aspect: '1:1',  hint: 'Instagram feed', shapeW: 14, shapeH: 14 },
  { id: 'story',       label: 'Story',       aspect: '9:16', hint: 'Stories e Reels', shapeW: 8,  shapeH: 14 },
  { id: 'reels_cover', label: 'Capa Reels',  aspect: '9:16', hint: 'Cover do Reels',  shapeW: 8,  shapeH: 14 },
  { id: 'banner',      label: 'Banner',      aspect: '16:9', hint: 'Site, blog, anúncio', shapeW: 18, shapeH: 10 },
  { id: 'thumbnail',   label: 'Thumbnail',   aspect: '16:9', hint: 'Capa de YouTube',  shapeW: 18, shapeH: 10 },
  { id: 'logo',        label: 'Logo',        aspect: '1:1',  hint: 'Marca em quadrado', shapeW: 14, shapeH: 14 },
  { id: 'custom',      label: 'Custom',      aspect: '—',    hint: 'Defina o aspect ratio', shapeW: 12, shapeH: 12 },
];

export default function FormatSelector({ value, onChange }) {
  return (
    <div className={styles.formatGrid} role="radiogroup" aria-label="Formato">
      {FORMATS.map(f => {
        const active = value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            onClick={() => onChange(f.id)}
            className={styles.formatCard}
            title={f.hint}
          >
            <span
              className={styles.formatShape}
              style={{ width: f.shapeW, height: f.shapeH }}
              aria-hidden="true"
            />
            <span className={styles.formatLabel}>{f.label}</span>
            <span className={styles.formatAspect}>{f.aspect}</span>
            <span className={styles.formatHint}>{f.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export { FORMATS };
