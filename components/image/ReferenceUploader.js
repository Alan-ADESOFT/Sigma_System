/**
 * components/image/ReferenceUploader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload de até 5 imagens de referência para a geração.
 *   · Drag & drop ou click
 *   · Validações: max 5, max 10 MB cada, MIME jpeg/png/webp
 *   · POST pra /api/upload (já existe), guarda { url, mode } no estado
 *
 * Sprint v1.1 — abril 2026: cada slot tem dropdown de MODO:
 *   · Inspiration (default) — aproveita estilo, paleta, mood
 *   · Character — preserva pessoa/objeto exato
 *   · Scene — usa como fundo/ambiente
 * Indicador visual de compatibilidade com modelo escolhido.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

const MAX_REFS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MODES = [
  { id: 'inspiration', label: 'Inspiração', hint: 'Aproveita estilo, paleta e mood (não copia o conteúdo)' },
  { id: 'character',   label: 'Personagem', hint: 'Mantém a pessoa/objeto exato no resultado' },
  { id: 'scene',       label: 'Cenário',    hint: 'Usa esta imagem como fundo/ambiente' },
];

// Modelos que aceitam image input (atualizado quando o lineup muda).
// Refs em modo 'character' precisam de modelo que suporte; senão warning.
const MODELS_WITH_IMAGE_INPUT = new Set([
  'gemini-3.1-flash-image-preview',
  'fal-ai/flux-pro/kontext',
  'gpt-image-2',
  'imagen-3.0-capability-001',
  // Compat reversa
  'nano-banana',
  'flux-1.1-pro',
  'gpt-image-1',
  'imagen-3',
]);

function normalizeUploadUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return parsed.pathname + (parsed.search || '');
  } catch {
    return url;
  }
}

/**
 * @param {object} props
 * @param {Array<{url: string, mode: string}>} props.value
 * @param {Function} props.onChange
 * @param {string} [props.currentModel] - pra mostrar warning de compatibilidade
 */
export default function ReferenceUploader({ value = [], onChange, currentModel }) {
  const { notify } = useNotification();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Compat reversa: aceita value como array plano de strings (legado) e converte
  const refs = Array.isArray(value)
    ? value.map(v => (typeof v === 'string' ? { url: v, mode: 'character' } : v))
    : [];

  function emit(next) {
    onChange(next);
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    const remaining = MAX_REFS - refs.length;
    if (remaining <= 0) {
      notify(`Máximo ${MAX_REFS} referências`, 'warning');
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    setUploading(true);
    const newRefs = [];
    for (const file of accepted) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        notify(`Formato inválido: ${file.name} (use jpeg/png/webp)`, 'error');
        continue;
      }
      if (file.size > MAX_BYTES) {
        notify(`${file.name} excede 10 MB`, 'error');
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.url) {
          const normalized = normalizeUploadUrl(json.url);
          // Sprint v1.1 — default = 'character' (caso de uso mais comum:
// preservar pessoa/objeto da foto). User pode trocar via dropdown.
newRefs.push({ url: normalized, mode: 'character' });
        } else {
          throw new Error(json.error || 'falha no upload');
        }
      } catch (err) {
        console.error('[ERRO][Frontend:ReferenceUploader] upload', err.message);
        notify(`Erro: ${err.message}`, 'error');
      }
    }
    setUploading(false);
    if (newRefs.length) emit([...refs, ...newRefs]);
  }

  function removeAt(idx) {
    emit(refs.filter((_, i) => i !== idx));
  }

  function setMode(idx, mode) {
    const next = refs.slice();
    next[idx] = { ...next[idx], mode };
    emit(next);
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  const hasCharacterRef = refs.some(r => r.mode === 'character');
  const modelSupportsImageInput = currentModel && MODELS_WITH_IMAGE_INPUT.has(currentModel);
  const showCompatWarning = hasCharacterRef && currentModel && !modelSupportsImageInput;

  return (
    <div>
      <div
        className={styles.refsGrid}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          multiple
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {refs.map((r, i) => (
          <div key={r.url + i} className={styles.refSlot} style={{ borderStyle: 'solid', flexDirection: 'column', gap: 4, padding: 4, position: 'relative' }}>
            <img src={r.url} alt={`Referência ${i + 1}`} className={styles.refSlotImg} />
            <select
              value={r.mode || 'inspiration'}
              onChange={e => setMode(i, e.target.value)}
              title={MODES.find(m => m.id === r.mode)?.hint || ''}
              style={{
                fontSize: '0.55rem',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(0,0,0,0.7)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 3,
                padding: '2px 4px',
                position: 'absolute',
                bottom: 4,
                left: 4,
                right: 24,
                cursor: 'pointer',
              }}
            >
              {MODES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.refSlotRemove}
              onClick={() => removeAt(i)}
              aria-label="Remover referência"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}

        {refs.length < MAX_REFS && (
          <button
            type="button"
            className={styles.refSlot}
            onClick={() => inputRef.current?.click()}
            aria-label="Adicionar referência"
          >
            {uploading ? (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : (
              <Icon name="plus" size={16} />
            )}
          </button>
        )}
      </div>

      {showCompatWarning && (
        <div style={{
          marginTop: 8,
          padding: '6px 10px',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-sans)',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: 4,
          color: '#f59e0b',
          lineHeight: 1.4,
        }}>
          <strong>Atenção:</strong> O modelo selecionado não usa imagens como entrada — vai tratar a referência como inspiração textual apenas. Use Flux Kontext Pro ou Nano Banana 2 para preservar a pessoa.
        </div>
      )}
    </div>
  );
}
