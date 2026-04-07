/**
 * pages/dashboard/publish.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Publicar Agora — publica imediatamente no Instagram do cliente selecionado.
 *
 * Layout: 2 colunas — formulário + preview de smartphone em tempo real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DashboardLayout from '../../components/DashboardLayout';
import ClientSelect from '../../components/ClientSelect';
import InstagramPreview from '../../components/InstagramPreview';
import MediaUploader from '../../components/MediaUploader';
import { useNotification } from '../../context/NotificationContext';
import styles from '../../assets/style/publishNow.module.css';

const MEDIA_TYPES = [
  { value: 'IMAGE',    label: 'Foto' },
  { value: 'REELS',    label: 'Reels' },
  { value: 'CAROUSEL', label: 'Carrossel' },
  { value: 'STORIES',  label: 'Stories' },
];

export default function PublishNowPage() {
  const { notify } = useNotification();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');

  const [account, setAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);

  const [mediaType, setMediaType] = useState('IMAGE');
  // Estado unificado: arrays de objetos { url, kind, mime, size }
  const [imageMedia, setImageMedia] = useState([]);
  const [videoMedia, setVideoMedia] = useState([]);
  const [caption, setCaption] = useState('');

  const [stage, setStage] = useState('idle'); // idle | sending | processing | success | error
  const [resultLink, setResultLink] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  /* Carrega clientes */
  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { if (d.success) setClients(d.clients || []); })
      .catch(() => notify('Erro ao carregar clientes', 'error'))
      .finally(() => setLoadingClients(false));
  }, []);

  /* Carrega conta ao trocar cliente */
  const loadAccount = useCallback(async () => {
    if (!selectedClientId) {
      setAccount(null);
      return;
    }
    setLoadingAccount(true);
    try {
      const res = await fetch(`/api/instagram/account?clientId=${selectedClientId}`);
      const data = await res.json();
      if (data.success) setAccount(data.account);
    } catch {
      notify('Falha ao carregar conta', 'error');
    } finally {
      setLoadingAccount(false);
    }
  }, [selectedClientId]);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  /* Reset ao trocar tipo */
  function handleTypeChange(t) {
    setMediaType(t);
    if (t === 'REELS') setImageMedia([]);
    if (t === 'IMAGE' || t === 'CAROUSEL') setVideoMedia([]);
  }

  function reset() {
    setStage('idle');
    setResultLink('');
    setErrorMsg('');
    setImageMedia([]);
    setVideoMedia([]);
    setCaption('');
  }

  async function handlePublish() {
    if (!account) {
      notify('Cliente não tem Instagram conectado', 'error');
      return;
    }

    // Validação client-side
    const errs = [];
    if (mediaType === 'IMAGE' && imageMedia.length === 0) errs.push('Adicione uma imagem');
    if (mediaType === 'REELS' && videoMedia.length === 0) errs.push('Adicione um vídeo');
    if (mediaType === 'CAROUSEL' && imageMedia.length < 2) errs.push('Carrossel exige 2+ imagens');
    if (mediaType === 'STORIES' && imageMedia.length === 0 && videoMedia.length === 0) {
      errs.push('Adicione uma mídia para o Stories');
    }
    if (caption.length > 2200) errs.push('Legenda excede 2200 caracteres');
    if (errs.length > 0) {
      errs.forEach((e) => notify(e, 'error'));
      return;
    }

    setStage('sending');
    setErrorMsg('');
    notify('Enviando para o Instagram', 'info');

    const imageUrls = imageMedia.map((m) => m.url);
    const videoUrl = videoMedia[0]?.url;

    try {
      const res = await fetch('/api/instagram/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          mediaType,
          imageUrl: imageUrls[0] || undefined,
          videoUrl: videoUrl || undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          caption,
        }),
      });

      setStage('processing');
      const data = await res.json();

      if (data.success) {
        setStage('success');
        setResultLink(data.permalink || '');
        notify('Publicado com sucesso', 'success');
      } else {
        setStage('error');
        setErrorMsg(data.error || 'Erro desconhecido');
        notify(data.error || 'Erro ao publicar', 'error');
      }
    } catch (err) {
      setStage('error');
      setErrorMsg(err.message);
      notify('Erro ao publicar', 'error');
    }
  }

  // Para o preview
  const previewImageUrls = imageMedia.map((m) => m.url);
  const previewVideoUrl = videoMedia[0]?.url;

  return (
    <DashboardLayout activeTab="publish">
      <div className={styles.header}>
        <div>
          <h1 className="page-title">Publicar Agora</h1>
          <p className="page-subtitle">Publique conteúdo imediatamente no Instagram do cliente</p>
        </div>
        <ClientSelect
          clients={clients}
          value={selectedClientId}
          onChange={setSelectedClientId}
          loading={loadingClients}
          allowEmpty
        />
      </div>

      {!selectedClientId ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <div className={styles.emptyTitle}>Selecione um cliente</div>
          <div className={styles.emptyDesc}>Escolha um cliente para começar a publicar.</div>
        </div>
      ) : loadingAccount ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <div className="spinner" />
        </div>
      ) : !account ? (
        <div className={`glass-card ${styles.emptyState}`}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,0,51,0.4)" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          <div className={styles.emptyTitle}>Instagram não conectado</div>
          <div className={styles.emptyDesc}>Conecte o Instagram deste cliente para publicar.</div>
          <Link href={`/dashboard/clients/${selectedClientId}?tab=instagram`} className="sigma-btn-primary" style={{ marginTop: 12 }}>
            Conectar Instagram
          </Link>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* FORMULÁRIO */}
          <div className={`glass-card ${styles.form}`}>
            {/* Tipo */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>// TIPO DE PUBLICAÇÃO</div>
              <div className={styles.typeGrid}>
                {MEDIA_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeBtn} ${mediaType === t.value ? styles.typeBtnActive : ''}`}
                    onClick={() => handleTypeChange(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mídia */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>// MÍDIA</div>

              {(mediaType === 'IMAGE' || mediaType === 'CAROUSEL' || mediaType === 'STORIES') && (
                <MediaUploader
                  accept="image"
                  multiple={mediaType === 'CAROUSEL'}
                  value={imageMedia}
                  onChange={setImageMedia}
                  label={mediaType === 'CAROUSEL' ? 'Imagens do carrossel (2+)' : 'Imagem'}
                />
              )}

              {(mediaType === 'REELS' || mediaType === 'STORIES') && (
                <MediaUploader
                  accept="video"
                  multiple={false}
                  value={videoMedia}
                  onChange={setVideoMedia}
                  label="Vídeo"
                />
              )}
            </div>

            {/* Legenda */}
            {mediaType !== 'STORIES' && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>// LEGENDA</div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    Texto <span className={styles.charCount}>{caption.length} / 2200</span>
                  </label>
                  <textarea
                    className="sigma-input"
                    rows={6}
                    maxLength={2200}
                    placeholder="Escreva a legenda do post..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* Status feedback */}
            {stage !== 'idle' && (
              <div className={`${styles.statusBox} ${styles[`status_${stage}`]}`}>
                {stage === 'sending' && (
                  <>
                    <div className="spinner" /> Enviando para o Instagram...
                  </>
                )}
                {stage === 'processing' && (
                  <>
                    <div className="spinner" /> Aguardando processamento...
                  </>
                )}
                {stage === 'success' && (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Publicado com sucesso
                    {resultLink && (
                      <a href={resultLink} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
                        Ver no Instagram →
                      </a>
                    )}
                  </>
                )}
                {stage === 'error' && (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Erro: {errorMsg}
                  </>
                )}
              </div>
            )}

            {/* Ações */}
            <div className={styles.actions}>
              {stage === 'success' || stage === 'error' ? (
                <button className="btn btn-secondary" onClick={reset}>
                  Nova publicação
                </button>
              ) : (
                <button
                  className="sigma-btn-primary"
                  onClick={handlePublish}
                  disabled={stage === 'sending' || stage === 'processing'}
                >
                  {stage === 'idle' ? 'PUBLICAR AGORA' : 'PUBLICANDO...'}
                </button>
              )}
            </div>
          </div>

          {/* PREVIEW */}
          <div className={styles.previewWrapper}>
            <div className={styles.previewLabel}>// PREVIEW EM TEMPO REAL</div>
            <InstagramPreview
              mode="post"
              account={account}
              mediaType={mediaType}
              imageUrls={previewImageUrls}
              videoUrl={previewVideoUrl}
              caption={caption}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
