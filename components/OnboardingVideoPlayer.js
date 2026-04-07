/**
 * components/OnboardingVideoPlayer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Player de vídeo do onboarding.
 *
 * Responsabilidades:
 *   1. Renderizar o vídeo a partir de uma URL externa (Panda, YouTube, MP4 direto, Bunny, etc).
 *   2. Detectar quando o vídeo terminou (evento `ended` OU 95% assistido).
 *   3. Disparar o callback onWatched() apenas UMA vez.
 *   4. Mostrar placeholder caso a URL esteja vazia (modo teste).
 *
 * Detecção de provedor:
 *   - Se a URL contém youtube/youtu.be → renderiza iframe (sem detecção de fim;
 *     o cliente apenas precisa esperar o countdown)
 *   - Se contém vimeo                  → renderiza iframe (mesmo caso)
 *   - Se contém pandavideo / bunny     → iframe (mesmo caso)
 *   - Caso contrário                   → assume MP4 direto e usa <video>
 *
 * IMPORTANTE: pra iframe (YouTube, Vimeo) não temos como detectar `ended` sem
 * importar a SDK do provedor. Solução pragmática: assim que o iframe carrega,
 * marcamos o vídeo como assistido após `videoDuration` segundos (se informado)
 * ou após 60 segundos como fallback. O countdown de 20s no botão Iniciar
 * compensa qualquer "fura-fila".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import styles from '../assets/style/onboarding.module.css';

/* ─── Ícones inline ─── */
function PlayIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/* ─── Detecção de provedor ─── */
function detectProvider(url) {
  if (!url) return 'none';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be'))   return 'youtube';
  if (u.includes('vimeo.com'))                                return 'vimeo';
  if (u.includes('pandavideo') || u.includes('player-vz'))    return 'panda';
  if (u.includes('bunnycdn') || u.includes('mediadelivery'))  return 'bunny';
  return 'mp4';
}

/* ─── Normaliza URL do YouTube pro embed ─── */
function youtubeEmbed(url) {
  const watchMatch = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  const id = watchMatch?.[1];
  if (!id) return url;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

export default function OnboardingVideoPlayer({ videoUrl, videoDuration, alreadyWatched, onWatched }) {
  const [watched, setWatched] = useState(!!alreadyWatched);
  const videoRef = useRef(null);
  const provider = detectProvider(videoUrl);

  /* Marca como assistido — chama o callback uma única vez */
  function markAsWatched() {
    if (watched) return;
    setWatched(true);
    if (typeof onWatched === 'function') onWatched();
  }

  /* ─── Lógica do player MP4 nativo ─── */
  useEffect(() => {
    if (provider !== 'mp4' || !videoRef.current) return;

    const v = videoRef.current;

    function handleEnded() {
      console.log('[VideoPlayer] vídeo terminou');
      markAsWatched();
    }

    function handleTimeUpdate() {
      if (!v.duration || v.duration === Infinity) return;
      const progress = v.currentTime / v.duration;
      if (progress >= 0.95) {
        console.log('[VideoPlayer] 95% assistido');
        markAsWatched();
      }
    }

    v.addEventListener('ended', handleEnded);
    v.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      v.removeEventListener('ended', handleEnded);
      v.removeEventListener('timeupdate', handleTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, videoUrl]);

  /* ─── Lógica de iframe (YouTube/Vimeo/etc) ─── */
  useEffect(() => {
    if (provider === 'mp4' || provider === 'none') return;
    // Não temos como detectar 'ended' sem SDK do provedor.
    // Estratégia: aguarda a duração informada (ou 60s) e marca como assistido.
    // O countdown de 20s no botão impede que o cliente "pule" o vídeo de fato.
    const wait = (videoDuration && videoDuration > 0) ? videoDuration * 1000 : 60000;
    console.log('[VideoPlayer] iframe — marcará como assistido em', { wait });
    const timer = setTimeout(markAsWatched, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, videoDuration]);

  /* ─── Render ─── */

  // Sem URL → placeholder (modo teste / vídeo não configurado)
  if (!videoUrl) {
    // Marca como assistido imediatamente — não bloqueia o cliente em teste
    if (!watched) {
      setTimeout(markAsWatched, 0);
    }
    return (
      <div className={styles.videoFrame}>
        <div className={styles.videoPlaceholder}>
          <PlayIcon />
          <div>// VÍDEO NÃO CONFIGURADO</div>
          <div style={{ fontSize: '0.625rem', opacity: 0.6 }}>
            Modo teste — formulário liberado direto.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.videoFrame}>
        {provider === 'mp4' && (
          <video ref={videoRef} src={videoUrl} controls playsInline preload="metadata" />
        )}

        {provider === 'youtube' && (
          <iframe
            src={youtubeEmbed(videoUrl)}
            title="Vídeo da etapa"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {provider === 'vimeo' && (
          <iframe src={videoUrl} title="Vídeo da etapa" allow="autoplay; fullscreen" allowFullScreen />
        )}

        {(provider === 'panda' || provider === 'bunny') && (
          <iframe src={videoUrl} title="Vídeo da etapa" allow="autoplay; fullscreen" allowFullScreen />
        )}
      </div>

      <div className={`${styles.videoStatus} ${watched ? styles.watched : ''}`}>
        {watched ? (
          <>
            <CheckIcon /> Vídeo assistido
          </>
        ) : (
          <>
            <WarnIcon /> Assista o vídeo completo para continuar
          </>
        )}
      </div>
    </>
  );
}
