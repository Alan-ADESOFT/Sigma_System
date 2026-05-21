/**
 * @fileoverview Modal de pre-visualizacao do export
 *
 * Recebe o HTML ja renderizado pelo backend (POST /api/copy/export
 * format=preview) e exibe num iframe srcDoc. Botoes de download geram
 * o PDF/DOCX em background e oferecem o arquivo final.
 *
 * Props:
 *   open       — bool
 *   onClose    — fecha
 *   onBack     — volta pro modal de escolha
 *   html       — string HTML renderizada pra iframe
 *   loading    — bool, mostra skeleton
 *   info       — { template, format, useBrandbook, brandbookFound }
 *   onDownload(format) — dispara geracao do arquivo final, espera pronto e baixa
 */

import { useEffect, useState } from 'react';
import styles from '../../assets/style/exportCopy.module.css';

const TEMPLATE_NAMES = {
  landing:  'Landing Page',
  planning: 'Planejamento de Conteudo',
  freeform: 'Copy Avulso',
};

export default function ExportPreviewModal({
  open, onClose, onBack, html, loading, info, onDownload, brandbookFound = true,
}) {
  const [busyFormat, setBusyFormat] = useState(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = async (format) => {
    if (busyFormat) return;
    setBusyFormat(format);
    try {
      await onDownload(format);
    } finally { setBusyFormat(null); }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.titleBadge}>PREVIEW</span>
            Pre-visualizar export
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Sprint v2.1: identidade SIGMA fixa — sem aviso de brandbook ausente.
             O preview ja renderiza com a paleta editorial padrao SIGMA. */}

        <div className={styles.previewBody}>
          <div className={styles.previewSidebar}>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Template</div>
              <div className={styles.infoValue}>{TEMPLATE_NAMES[info?.template] || info?.template}</div>
            </div>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Formato escolhido</div>
              <div className={styles.infoValue}>{(info?.format || 'pdf').toUpperCase()}</div>
            </div>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Identidade visual</div>
              <div className={styles.infoValue}>SIGMA editorial (preto · branco · vermelho)</div>
            </div>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Estruturado por</div>
              <div className={styles.infoValue}>Claude Sonnet 4.6 (enricher)</div>
            </div>
            <div className={styles.infoRow}>
              <div className={styles.infoLabel}>Tamanho estimado</div>
              <div className={styles.infoValue}>~{Math.max(50, Math.round((html?.length || 0) / 1024))} KB de HTML</div>
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className={styles.infoLabel}>Dica</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 4 }}>
                O download em PDF/DOCX e gerado em background — voce pode fechar o modal e o arquivo aparece no sininho.
              </div>
            </div>
          </div>

          <div className={styles.previewIframeWrap}>
            {loading ? (
              <div className={styles.previewLoading}>
                <div className={styles.spinnerLg} />
                <div>Sonnet 4.6 estruturando o documento...</div>
              </div>
            ) : (
              <iframe
                title="Preview do documento"
                className={styles.previewIframe}
                srcDoc={html || '<html><body style="font-family:sans-serif;padding:40px;color:#666;">Sem conteudo</body></html>'}
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>

        <div className={styles.previewFooter}>
          <button className={styles.backBtn} onClick={onBack}>← Voltar</button>
          <div className={styles.downloadGroup}>
            <button
              className={styles.downloadBtn}
              data-busy={busyFormat === 'pdf' ? 'true' : 'false'}
              disabled={loading || busyFormat !== null}
              onClick={() => handleDownload('pdf')}>
              {busyFormat === 'pdf' ? (
                <><span className={styles.spinnerLg} style={{ width: 11, height: 11, borderWidth: 2 }} /> Gerando PDF...</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>Baixar PDF</>
              )}
            </button>
            <button
              className={styles.downloadBtn}
              data-busy={busyFormat === 'docx' ? 'true' : 'false'}
              disabled={loading || busyFormat !== null}
              onClick={() => handleDownload('docx')}>
              {busyFormat === 'docx' ? (
                <><span className={styles.spinnerLg} style={{ width: 11, height: 11, borderWidth: 2 }} /> Gerando DOCX...</>
              ) : 'Baixar DOCX'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
