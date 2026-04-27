/**
 * components/image/ReferenceUploader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload de até 5 imagens de referência para a geração.
 *   · Drag & drop ou click
 *   · Validações: max 5, max 10 MB cada, MIME jpeg/png/webp
 *   · POST pra /api/upload (já existe), guarda URL interna no estado
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import styles from '../../assets/style/imageWorkspace.module.css';

const MAX_REFS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Normaliza a URL retornada por /api/upload para um caminho relativo
 * `/uploads/...`. O endpoint às vezes devolve URL absoluta com hostname
 * (ngrok, dominio prod, localhost), o que quebra:
 *   1. A validação SSRF do backend de /api/image/generate (exige path relativo)
 *   2. O preview no <img> quando o hostname muda entre sessões
 *
 * Estratégia: se a URL tem scheme http(s), pega só o pathname. Se já é
 * caminho relativo, retorna como veio.
 */
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

export default function ReferenceUploader({ value = [], onChange }) {
  const { notify } = useNotification();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files) {
    if (!files || !files.length) return;
    const remaining = MAX_REFS - value.length;
    if (remaining <= 0) {
      notify(`Máximo ${MAX_REFS} referências`, 'warning');
      return;
    }
    const accepted = Array.from(files).slice(0, remaining);
    setUploading(true);
    const newUrls = [];
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
          // Normaliza pra path relativo — evita problemas com hostname
          // (ngrok, prod, localhost) e satisfaz a validação SSRF do backend.
          const normalized = normalizeUploadUrl(json.url);
          newUrls.push(normalized);
        } else {
          throw new Error(json.error || 'falha no upload');
        }
      } catch (err) {
        console.error('[ERRO][Frontend:ReferenceUploader] upload', err.message);
        notify(`Erro: ${err.message}`, 'error');
      }
    }
    setUploading(false);
    if (newUrls.length) onChange([...value, ...newUrls]);
  }

  function removeAt(idx) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
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

      {value.map((url, i) => (
        <div key={url + i} className={styles.refSlot} style={{ borderStyle: 'solid' }}>
          <img src={url} alt={`Referência ${i + 1}`} className={styles.refSlotImg} />
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

      {value.length < MAX_REFS && (
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
  );
}
