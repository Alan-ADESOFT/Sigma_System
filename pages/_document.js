import { Html, Head, Main, NextScript } from 'next/document';

/**
 * pages/_document.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Document raíz do Next.js — define <html> e <head> globais.
 *
 * Inclui:
 *   - Favicon (SVG) e apple-touch-icon
 *   - Meta theme-color (cor da barra superior do mobile)
 *   - Meta description + keywords (SEO básico)
 *   - Open Graph (preview em WhatsApp / Telegram / Slack / Discord / Facebook)
 *   - Twitter Card (preview no X/Twitter)
 *
 * O <title> NÃO é definido aqui — cada página define o seu via next/head,
 * caso contrário o Next dispara warning de duplicação.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SITE_NAME    = 'SIGMA Marketing';
const SITE_TITLE   = 'SIGMA — Marketing Strategy Engine';
const SITE_DESC    = 'Plataforma estratégica de marketing com pipeline IA: diagnóstico, concorrentes, público-alvo, avatar e posicionamento. Onboarding guiado de 15 dias e gestão completa de clientes.';
const SITE_URL     = process.env.NEXT_PUBLIC_APP_URL
                  || process.env.NEXT_PUBLIC_BASE_URL
                  || 'http://localhost:3001';
const OG_IMAGE     = `${SITE_URL.replace(/\/$/, '')}/og-image.svg`;
const OG_IMAGE_PNG = `${SITE_URL.replace(/\/$/, '')}/logo.png`;

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* ── Favicons ── */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link rel="mask-icon" href="/favicon.svg" color="#ff0033" />

        {/* ── Theme + viewport extras ── */}
        <meta name="theme-color" content="#050505" />
        <meta name="color-scheme" content="dark" />

        {/* ── SEO básico ── */}
        <meta name="description" content={SITE_DESC} />
        <meta name="keywords" content="marketing, agência, estratégia, IA, pipeline, diagnóstico, concorrentes, posicionamento, onboarding, sigma" />
        <meta name="author" content="SIGMA Marketing" />
        <meta name="application-name" content={SITE_NAME} />

        {/* ── Open Graph (WhatsApp, Telegram, Discord, Facebook, LinkedIn) ── */}
        <meta property="og:type"        content="website" />
        <meta property="og:site_name"   content={SITE_NAME} />
        <meta property="og:title"       content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESC} />
        <meta property="og:url"         content={SITE_URL} />
        <meta property="og:locale"      content="pt_BR" />
        <meta property="og:image"       content={OG_IMAGE} />
        <meta property="og:image:type"  content="image/svg+xml" />
        <meta property="og:image:width"  content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt"   content="SIGMA Marketing — Plataforma estratégica com IA" />
        {/* Fallback PNG pra clientes que não renderizam SVG (alguns scrapers do WhatsApp antigos) */}
        <meta property="og:image"       content={OG_IMAGE_PNG} />
        <meta property="og:image:type"  content="image/png" />
        <meta property="og:image:width"  content="1406" />
        <meta property="og:image:height" content="980" />

        {/* ── Twitter Card (X / Twitter) ── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESC} />
        <meta name="twitter:image"       content={OG_IMAGE} />
        <meta name="twitter:image:alt"   content="SIGMA Marketing — Plataforma estratégica com IA" />

        {/* ── Bloqueio de indexação (sistema interno) ── */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
