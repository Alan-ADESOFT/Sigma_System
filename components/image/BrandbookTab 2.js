/**
 * components/image/BrandbookTab.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba "Brandbook" dentro de pages/dashboard/clients/[id].js.
 *
 * Estados:
 *   · Loading inicial
 *   · Sem brandbook: 3 opções (IA, PDF, Manual)
 *   · Com brandbook: BrandbookEditor + header com badge "Ativo"
 *   · Em fluxo IA/PDF: mostra editor com seedStructuredData (precisa salvar)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Icon } from './ImageIcons';
import HowItWorksImage from './HowItWorksImage';
import styles from '../../assets/style/brandbook.module.css';

import BrandbookEditor from './BrandbookEditor';
import BrandbookFromAIModal from './BrandbookFromAIModal';
import BrandbookPdfUploadModal from './BrandbookPdfUploadModal';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const SOURCE_LABEL = {
  ai_generated: 'gerado por IA',
  pdf_upload:   'upload PDF',
  html_upload:  'upload HTML',
  manual:       'manual',
};

export default function BrandbookTab({ clientId }) {
  const { notify } = useNotification();
  const [brandbook, setBrandbook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [showReplaceMenu, setShowReplaceMenu] = useState(false);
  const [seedData, setSeedData] = useState(null);   // estrutura gerada por IA/PDF aguardando review
  const [seedMeta, setSeedMeta] = useState(null);
  const replaceMenuRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/image/brandbook/${clientId}`);
      const json = await res.json();
      if (json.success) {
        setBrandbook(json.data?.active || null);
      }
    } catch (err) {
      console.error('[ERRO][Frontend:BrandbookTab]', err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Click outside replace menu
  useEffect(() => {
    if (!showReplaceMenu) return;
    function onClick(e) {
      if (replaceMenuRef.current && !replaceMenuRef.current.contains(e.target)) {
        setShowReplaceMenu(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showReplaceMenu]);

  function handleAIGenerated(structured, meta) {
    setShowAI(false);
    setSeedData(structured);
    setSeedMeta(meta);
    setBrandbook(null); // força editor com seed
  }
  function handlePdfExtracted(structured, meta) {
    setShowPdf(false);
    setSeedData(structured);
    setSeedMeta(meta);
    setBrandbook(null);
  }
  function startManual() {
    setSeedData({});
    setSeedMeta({ source: 'manual' });
    setBrandbook(null);
  }

  async function handleSaved(updated) {
    setBrandbook(updated);
    setSeedData(null);
    setSeedMeta(null);
  }

  async function handleDelete() {
    if (!brandbook?.id) return;
    if (!window.confirm('Apagar o brandbook ativo deste cliente? Essa ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/image/brandbook/${clientId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      notify('Brandbook removido', 'success');
      setBrandbook(null);
    } catch (err) {
      notify(`Erro: ${err.message}`, 'error');
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.tab}>
        <div className="glass-card" style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
          <span className="spinner" style={{ width: 18, height: 18, margin: '0 auto 10px' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em' }}>
            CARREGANDO BRANDBOOK...
          </div>
        </div>
      </div>
    );
  }

  // Empty state — sem brandbook ativo nem seed em revisão
  if (!brandbook && !seedData) {
    return (
      <div className={styles.tab}>
        <HowItWorksImage variant="brandbook" />
        <div className={`glass-card ${styles.empty}`}>
          <div className={styles.emptyIcon}><Icon name="palette" size={22} /></div>
          <div className={styles.emptyTitle}>Crie o brandbook deste cliente</div>
          <p className={styles.emptySub}>
            O brandbook é a identidade visual do cliente: paleta, tipografia, tom, regras
            do que fazer e do que evitar. Ele é injetado automaticamente em todas as
            gerações de imagem para garantir consistência de marca.
          </p>

          <div className={styles.optionsGrid}>
            <button type="button" className={`glass-card glass-card-hover ${styles.optionCard}`} onClick={() => setShowAI(true)}>
              <div className={styles.optionIcon}><Icon name="sparkles" size={16} /></div>
              <div className={styles.optionTitle}>Gerar com IA</div>
              <div className={styles.optionDesc}>
                Descreva a marca em texto livre e a IA estrutura tudo: cores, tipografia,
                tom e regras.
              </div>
              <span className="sigma-btn-primary btn-sm">
                Começar
              </span>
            </button>

            <button type="button" className={`glass-card glass-card-hover ${styles.optionCard}`} onClick={() => setShowPdf(true)}>
              <div className={styles.optionIcon}><Icon name="upload" size={16} /></div>
              <div className={styles.optionTitle}>Upload PDF/HTML</div>
              <div className={styles.optionDesc}>
                Já tem o brandbook em PDF ou HTML? Faça upload e a IA extrai
                automaticamente a estrutura.
              </div>
              <span className="sigma-btn-primary btn-sm">
                Enviar arquivo
              </span>
            </button>

            <button type="button" className={`glass-card glass-card-hover ${styles.optionCard}`} onClick={startManual}>
              <div className={styles.optionIcon}><Icon name="edit" size={16} /></div>
              <div className={styles.optionTitle}>Manual</div>
              <div className={styles.optionDesc}>
                Crie do zero, preenchendo cada campo manualmente. Bom quando você já tem
                tudo em mente.
              </div>
              <span className="sigma-btn-primary btn-sm">
                Criar do zero
              </span>
            </button>
          </div>
        </div>

        {showAI  && <BrandbookFromAIModal     clientId={clientId} onClose={() => setShowAI(false)}  onGenerated={handleAIGenerated} />}
        {showPdf && <BrandbookPdfUploadModal clientId={clientId} onClose={() => setShowPdf(false)} onExtracted={handlePdfExtracted} />}
      </div>
    );
  }

  // Editor (brandbook ativo OU seed em revisão)
  return (
    <div className={styles.tab}>
      <div className={`glass-card ${styles.header}`}>
        <div className={styles.headerLeft}>
          {brandbook ? (
            <>
              <span className={styles.activeBadge}>
                <Icon name="check" size={10} /> Ativo
              </span>
              <span className={styles.sourceTag}>
                · {SOURCE_LABEL[brandbook.source] || brandbook.source} em {formatDate(brandbook.created_at)}
              </span>
            </>
          ) : (
            <span className={styles.activeBadge} style={{
              background: 'rgba(249,115,22,0.08)',
              borderColor: 'rgba(249,115,22,0.25)',
              color: 'var(--warning)',
            }}>
              <Icon name="alert" size={10} />
              Pendente — revise e salve
            </span>
          )}
        </div>

        <div className={styles.headerActions} ref={replaceMenuRef}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowReplaceMenu(v => !v)}
          >
            Substituir brandbook
            <Icon name="chevronDown" size={11} />
          </button>
          {brandbook && (
            <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
              <Icon name="trash" size={11} /> Apagar
            </button>
          )}
          {showReplaceMenu && (
            <div className={styles.replaceMenu}>
              <button type="button" className={styles.replaceMenuItem} onClick={() => { setShowReplaceMenu(false); setShowAI(true); }}>
                <Icon name="sparkles" size={12} /> Gerar com IA
              </button>
              <button type="button" className={styles.replaceMenuItem} onClick={() => { setShowReplaceMenu(false); setShowPdf(true); }}>
                <Icon name="upload" size={12} /> Upload PDF/HTML
              </button>
              <button type="button" className={styles.replaceMenuItem} onClick={() => { setShowReplaceMenu(false); startManual(); }}>
                <Icon name="edit" size={12} /> Criar manual
              </button>
            </div>
          )}
        </div>
      </div>

      <BrandbookEditor
        brandbook={brandbook}
        clientId={clientId}
        seedStructuredData={seedData}
        onSaved={handleSaved}
      />

      {showAI  && <BrandbookFromAIModal     clientId={clientId} onClose={() => setShowAI(false)}  onGenerated={handleAIGenerated} />}
      {showPdf && <BrandbookPdfUploadModal clientId={clientId} onClose={() => setShowPdf(false)} onExtracted={handlePdfExtracted} />}
    </div>
  );
}
