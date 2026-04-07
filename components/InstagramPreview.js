/**
 * components/InstagramPreview.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Mockup de feed do Instagram dentro de um frame de smartphone.
 *
 * Usado em:
 *   · Planejamento (pages/dashboard/content-plan.js)
 *   · Publicar Agora (pages/dashboard/publish.js)
 *
 * Modos:
 *   · post   → preview de um post único (mediaType, mediaUrl, caption, account)
 *   · grid   → últimos posts em grid 3xN (recent[])
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import styles from '../assets/style/instagramPreview.module.css';

function PhoneFrame({ children }) {
  return (
    <div className={styles.phoneFrame}>
      <div className={styles.phoneNotch} />
      <div className={styles.phoneScreen}>{children}</div>
    </div>
  );
}

function InstagramHeader({ account }) {
  return (
    <div className={styles.igHeader}>
      {account?.profilePictureUrl ? (
        <img src={account.profilePictureUrl} alt="" className={styles.igAvatar} />
      ) : (
        <div className={styles.igAvatarPlaceholder}>
          {(account?.username || '?').slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className={styles.igUsername}>
        {account?.username || 'usuario'}
      </div>
      <div className={styles.igDots}>•••</div>
    </div>
  );
}

function ActionRow() {
  return (
    <div className={styles.igActions}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
      <div style={{ marginLeft: 'auto' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    </div>
  );
}

function PostMedia({ mediaType, imageUrls, videoUrl, ratio = '1' }) {
  const url = (imageUrls && imageUrls[0]) || videoUrl;
  const isVideo = mediaType === 'REELS' || mediaType === 'VIDEO' || (videoUrl && !imageUrls?.length);

  if (!url) {
    return (
      <div className={styles.mediaPlaceholder} style={{ aspectRatio: ratio }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span>Mídia aparecerá aqui</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={styles.mediaWrapper} style={{ aspectRatio: ratio }}>
        <video src={url} className={styles.mediaImg} muted playsInline preload="metadata" />
        <div className={styles.videoIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mediaWrapper} style={{ aspectRatio: ratio }}>
      <img src={url} alt="" className={styles.mediaImg} />
      {imageUrls && imageUrls.length > 1 && (
        <div className={styles.carouselDots}>
          {imageUrls.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === 0 ? styles.dotActive : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstagramPreview({
  mode = 'post',
  account,
  mediaType = 'IMAGE',
  imageUrls = [],
  videoUrl,
  caption,
  recent = [],
}) {
  if (mode === 'grid') {
    return (
      <PhoneFrame>
        <InstagramHeader account={account} />
        <div className={styles.gridContainer}>
          {recent.length === 0 ? (
            <div className={styles.gridEmpty}>// sem posts ainda</div>
          ) : (
            <div className={styles.grid3}>
              {recent.slice(0, 9).map((p) => {
                const thumb = p.thumbnail_url || p.media_url;
                return (
                  <div key={p.id} className={styles.gridItem}>
                    {thumb ? <img src={thumb} alt="" /> : <div className={styles.mediaPlaceholderSmall} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PhoneFrame>
    );
  }

  // Stories preview
  if (mediaType === 'STORIES') {
    return (
      <PhoneFrame>
        <div className={styles.storyContainer}>
          <PostMedia mediaType="IMAGE" imageUrls={imageUrls} videoUrl={videoUrl} ratio="9 / 16" />
          <div className={styles.storyHeader}>
            {account?.profilePictureUrl ? (
              <img src={account.profilePictureUrl} alt="" className={styles.igAvatar} />
            ) : (
              <div className={styles.igAvatarPlaceholder}>
                {(account?.username || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className={styles.igUsername}>{account?.username || 'usuario'}</div>
            <div className={styles.igUsername} style={{ opacity: 0.6 }}>agora</div>
          </div>
          <div className={styles.storyBars}>
            <div className={styles.storyBar} />
          </div>
        </div>
      </PhoneFrame>
    );
  }

  const previewCaption = (caption || '').slice(0, 150);
  const isLong = (caption || '').length > 150;

  return (
    <PhoneFrame>
      <InstagramHeader account={account} />
      <PostMedia
        mediaType={mediaType}
        imageUrls={imageUrls}
        videoUrl={videoUrl}
        ratio={mediaType === 'REELS' ? '9 / 16' : '1'}
      />
      <ActionRow />
      <div className={styles.captionRow}>
        <strong>{account?.username || 'usuario'}</strong>{' '}
        <span>{previewCaption}{isLong && <span className={styles.more}>... mais</span>}</span>
      </div>
      <div className={styles.timestamp}>AGORA</div>
    </PhoneFrame>
  );
}
