/**
 * pages/proposta/[slug].js
 * ─────────────────────────────────────────────────────────────────────────────
 * Página pública (SEM auth) que renderiza uma proposta SIGMA via slug.
 *  · getServerSideProps busca via /api/public/proposal/[slug] (mesmo origin).
 *  · Tracking via sendBeacon: start, ping a cada 5s, end no unload.
 *  · `<meta name="robots" content="noindex,nofollow">` — nunca indexar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import ProposalTemplate from '../../components/comercial/ProposalTemplate';
import ProposalIntro from '../../components/comercial/ProposalIntro';
import styles from '../../assets/proposta.module.css';

export async function getServerSideProps({ params }) {
  // Chamada DIRETA ao model em SSR — evita o roundtrip HTTP que falhava quando
  // NEXT_PUBLIC_BASE_URL aponta para uma URL externa (ngrok, prod ENV stale).
  try {
    const proposals = require('../../models/comercial/proposal.model');
    const { query } = require('../../infra/db');
    const row = await proposals.getProposalBySlug(params.slug);

    if (!row) {
      return { props: { status: 'error', errorType: 'not_found', slug: params.slug } };
    }

    // Auto-expire (mesma lógica do endpoint público)
    if (row.expires_at && new Date(row.expires_at) < new Date() && row.status === 'published') {
      try {
        await query(
          `UPDATE comercial_proposals SET status = 'expired' WHERE id = $1 AND status = 'published'`,
          [row.id]
        );
        row.status = 'expired';
      } catch {}
    }

    if (row.status === 'expired') {
      return { props: { status: 'error', errorType: 'expired', slug: params.slug, expiresAt: row.expires_at || null } };
    }
    if (row.status === 'draft') {
      return { props: { status: 'error', errorType: 'not_found', slug: params.slug } };
    }

    return {
      props: {
        status: 'ok',
        slug: params.slug,
        proposal: {
          slug: row.slug,
          data: row.data || {},
          publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
          expiresAt:   row.expires_at   ? new Date(row.expires_at).toISOString()   : null,
        },
      },
    };
  } catch (err) {
    console.error('[ERRO][SSR proposta/[slug]]', { error: err.message });
    return { props: { status: 'error', errorType: 'fetch_failed', slug: params.slug } };
  }
}

export default function PublicProposalPage({ status, proposal, errorType, slug, expiresAt }) {
  // Estado do intro/boot. URL ?skipIntro=1 pula direto. SessionStorage também
  // pula em recargas dentro da mesma sessão pra não enjoar o cliente.
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (status !== 'ok') { setIntroDone(true); return; }
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('skipIntro') === '1') { setIntroDone(true); return; }
    try {
      if (sessionStorage.getItem(`sigma:intro-seen:${slug}`) === '1') {
        setIntroDone(true);
      }
    } catch {}
  }, [status, slug]);

  if (status === 'error') {
    return <ExpiredOrNotFound type={errorType} expiresAt={expiresAt} />;
  }

  function handleIntroDone() {
    try { sessionStorage.setItem(`sigma:intro-seen:${slug}`, '1'); } catch {}
    setIntroDone(true);
  }

  return (
    <>
      <Head>
        <title>{`${proposal.data?.client_name || 'Proposta'} — SIGMA`}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content={`Proposta SIGMA — ${proposal.data?.client_name || ''}`} />
        <meta property="og:description" content="Proposta personalizada SIGMA Marketing" />
        <meta name="theme-color" content="#050505" />
      </Head>

      {!introDone && (
        <ProposalIntro
          clientName={proposal.data?.client_name || 'CLIENTE'}
          regionHint={proposal.data?.cover_region}
          onComplete={handleIntroDone}
        />
      )}

      {introDone && (
        <>
          <Tracker slug={slug} />
          <ProposalTemplate data={proposal.data || {}} slug={slug} status="published" />
        </>
      )}
    </>
  );
}

/** Componente isolado de tracking — minimiza re-renders. */
function Tracker({ slug }) {
  const viewIdRef    = useRef(null);
  const startedAtRef = useRef(Date.now());
  const maxScrollRef = useRef(0);
  const [, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let pingTimer;
    let mounted = true;

    // START
    fetch(`/api/public/proposal/${encodeURIComponent(slug)}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referer: typeof document !== 'undefined' ? (document.referrer || null) : null,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (mounted && d.success && d.viewId) viewIdRef.current = d.viewId;
      })
      .catch(() => {});

    // SCROLL
    function onScroll() {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) return;
      const pct = Math.round((window.scrollY / total) * 100);
      if (pct > maxScrollRef.current) maxScrollRef.current = Math.min(100, Math.max(0, pct));
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // PING a cada 5s
    pingTimer = setInterval(() => {
      const viewId = viewIdRef.current;
      if (!viewId) return;
      const timeSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      fetch(`/api/public/proposal/${encodeURIComponent(slug)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ping',
          viewId,
          timeSeconds,
          scrollPct: maxScrollRef.current,
        }),
        keepalive: true,
      }).catch(() => {});
    }, 5000);

    // END no unload
    function onUnload() {
      const viewId = viewIdRef.current;
      if (!viewId) return;
      const timeSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const payload = JSON.stringify({
        action: 'end',
        viewId,
        timeSeconds,
        scrollPct: maxScrollRef.current,
      });
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(`/api/public/proposal/${encodeURIComponent(slug)}/track`, blob);
      } catch {
        fetch(`/api/public/proposal/${encodeURIComponent(slug)}/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    }
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide',     onUnload);

    return () => {
      mounted = false;
      clearInterval(pingTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide',     onUnload);
      onUnload();
    };
  }, [slug]);

  return null;
}

function ExpiredOrNotFound({ type, expiresAt }) {
  const isExpired = type === 'expired';
  const title = isExpired
    ? 'Esta proposta expirou'
    : 'Proposta não encontrada';
  const message = isExpired
    ? 'O link desta proposta passou da validade. Entre em contato com o time da SIGMA para receber uma versão atualizada.'
    : 'A página que você procura não existe ou foi removida. Verifique o link com quem te enviou.';

  return (
    <>
      <Head>
        <title>{`${title} — SIGMA`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.expiredScreen}>
        <div className={`${styles.expiredCard} animate-scale-in`}>
          <div className={styles.expiredIcon}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isExpired ? (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </>
              )}
            </svg>
          </div>
          <div className={styles.expiredTitle}>{title}</div>
          <div className={styles.expiredDesc}>{message}</div>
          {isExpired && expiresAt && (
            <div className={styles.expiredDesc} style={{ marginTop: 12, fontSize: '0.8rem' }}>
              Expirou em {new Date(expiresAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
