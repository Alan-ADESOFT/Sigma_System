/**
 * @fileoverview Modal de escolha de template + formato pra export de copy
 *
 * Fluxo: usuario clica "Exportar" no toolbar do CopyWorkspace -> abre este
 * modal -> escolhe template (landing/planning/freeform) + formato
 * (PDF/DOCX) + brandbook on/off -> clica "Pre-visualizar" -> componente
 * pai (CopyWorkspace) chama POST /api/copy/export?format=preview e abre
 * o ExportPreviewModal com o HTML retornado.
 *
 * Props:
 *   open     — bool, se renderiza
 *   onClose  — fecha sem agir
 *   onPreview({ template, format, useBrandbook }) — segue pra preview
 *   hasClient — se ha cliente associado (controla default do brandbook)
 */

import { useEffect, useState } from 'react';
import styles from '../../assets/style/exportCopy.module.css';

const TEMPLATES = [
  { value: 'landing',  icon: '🌐', name: 'Landing Page',
    desc: 'Documento estruturado em secoes de uma landing (hero, beneficios, prova, oferta, CTA).' },
  { value: 'planning', icon: '📅', name: 'Planejamento de Conteudo',
    desc: 'Cronograma com posts organizados por item, formato e canal.' },
  { value: 'freeform', icon: '📝', name: 'Copy Avulso',
    desc: 'Documento limpo e neutro com a copy completa, sem suposicoes de estrutura.' },
];

export default function ExportCopyModal({ open, onClose, onPreview, hasClient }) {
  const [template, setTemplate] = useState('freeform');
  const [format, setFormat] = useState('pdf');
  const [useBrandbook, setUseBrandbook] = useState(!!hasClient);
  const [submitting, setSubmitting] = useState(false);

  // Reseta o brandbook toggle quando o modal reabre — evita estado preso
  useEffect(() => { if (open) setUseBrandbook(!!hasClient); }, [open, hasClient]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onPreview({ template, format, useBrandbook });
    } finally { setSubmitting(false); }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={styles.titleBadge}>EXPORT</span>
            Exportar copy
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Fechar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div>
            <div className={styles.sectionLabel}>Etapa 1 — Template</div>
            <div className={styles.templateGrid}>
              {TEMPLATES.map(t => (
                <button
                  type="button"
                  key={t.value}
                  className={template === t.value ? styles.templateCardActive : styles.templateCard}
                  onClick={() => setTemplate(t.value)}>
                  <div className={styles.templateIcon}>{t.icon}</div>
                  <div className={styles.templateName}>{t.name}</div>
                  <div className={styles.templateDesc}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={styles.sectionLabel}>Etapa 2 — Formato</div>
            <div className={styles.formatRow}>
              <button
                type="button"
                className={format === 'pdf' ? styles.formatBtnActive : styles.formatBtn}
                onClick={() => setFormat('pdf')}>
                PDF
                <span className={styles.formatBadge}>RECOMENDADO</span>
              </button>
              <button
                type="button"
                className={format === 'docx' ? styles.formatBtnActive : styles.formatBtn}
                onClick={() => setFormat('docx')}>
                DOCX
              </button>
            </div>
          </div>

          <div>
            <div className={styles.sectionLabel}>Etapa 3 — Identidade visual</div>
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Identidade SIGMA editorial</div>
                <div className={styles.toggleHint}>
                  Sprint v2.1: o documento e renderizado com a identidade SIGMA fixa
                  (preto/branco/vermelho, Inter+JetBrains Mono). Antes do render, o
                  Claude Sonnet 4.6 reorganiza a copy em secoes editoriais (hero,
                  callout, lista, CTA, FAQ, etc) — voce nao escolhe layout, a IA decide.
                </div>
              </div>
              <div
                className={styles.toggleSwitch}
                data-on="true"
                style={{ opacity: 0.55, cursor: 'not-allowed' }}
                role="switch"
                aria-checked={true}
                aria-disabled="true"
                title="Identidade SIGMA fixa nesta versao"
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerHint}>O arquivo so e gerado depois que voce confirmar no preview.</span>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <><span className={styles.spinnerLg} style={{ width: 12, height: 12, borderWidth: 2 }} /> Renderizando...</>
            ) : (
              <>Pre-visualizar
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
