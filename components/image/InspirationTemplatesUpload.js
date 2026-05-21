/**
 * @fileoverview Botao "Upload" reutilizavel pra galeria de templates
 *
 * Aceita upload multiplo. Sobe cada arquivo via /api/upload e cria a
 * template via endpoint passado em prop (apiPath). Usado em duas
 * superficies: settings/image-templates (global) e BrandbookTab (cliente).
 *
 * Sprint Image v2 (maio/2026).
 */

import { useRef, useState } from 'react';
import styles from '../../assets/style/inspirationTemplates.module.css';

/**
 * @param {object} props
 * @param {string} props.apiPath - endpoint POST que recebe { title, url, ...}
 * @param {object} [props.extraBody] - body extra (ex: { category: 'feed' })
 * @param {function} props.onUploaded - callback recebendo a lista de criados
 * @param {string} [props.label] - texto do botao
 * @param {string} [props.variant] - 'primary' | 'secondary'
 */
export default function InspirationTemplatesUpload({
  apiPath, extraBody = {}, onUploaded, label = '+ Upload', variant = 'secondary',
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files) {
    if (!files?.length) return;
    setBusy(true);
    const created = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: form });
        const upJson = await upRes.json();
        if (!upJson.success) throw new Error(upJson.error);

        const r = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
            url:   upJson.localPath,
            ...extraBody,
          }),
        });
        const j = await r.json();
        if (!j.success) throw new Error(j.error);
        created.push(j.data);
      } catch (err) {
        console.error('[ERRO][InspirationTemplatesUpload]', { file: file.name, error: err.message });
      }
    }
    setBusy(false);
    if (created.length && onUploaded) onUploaded(created);
  }

  const className = variant === 'primary' ? styles.uploadBtn : styles.inlineUploadBtn;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={busy}>
        {busy ? 'Subindo...' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp"
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
      />
    </>
  );
}
