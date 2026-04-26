/** @type {import('next').NextConfig} */

// Extrai o hostname do ngrok configurado no env para allowedDevOrigins
const allowedDevOrigins = [];
const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
if (appUrl && !appUrl.includes('localhost')) {
  try {
    const { host } = new URL(appUrl);
    if (host) allowedDevOrigins.push(host);
  } catch {
    // URL invalida, ignora
  }
}

// HARDENING: headers aplicados no nível do Next em rotas do módulo de imagem.
// Não vão para todas as rotas pra evitar conflito com integrações externas
// (preview Instagram, etc) que ainda dependem do comportamento atual.
const SECURITY_HEADERS = [
  // Impede sniff de MIME — navegador não tenta "adivinhar" o tipo do arquivo
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Não vaza URL completa do referrer pra origens externas
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Bloqueia clickjacking via <iframe> (proteção pros modais e overlays)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

const nextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  compress: true,
  experimental: {
    instrumentationHook: true,
    // Pacotes nativos / com bindings em C/Node — não bundlar, require em runtime.
    // Sem isso o webpack tenta seguir node:child_process dentro do sharp e
    // quebra com UnhandledSchemeError ao compilar instrumentation.js.
    serverComponentsExternalPackages: ['sharp', 'pdf-parse', 'mammoth'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
    ],
    formats: ['image/webp', 'image/avif'],
  },
  async headers() {
    return [
      { source: '/api/image/:path*',         headers: SECURITY_HEADERS },
      { source: '/dashboard/image/:path*',   headers: SECURITY_HEADERS },
      { source: '/dashboard/settings/image', headers: SECURITY_HEADERS },
    ];
  },
  // ── Webpack ──────────────────────────────────────────────────────────────
  // CONTEXTO: o instrumentation.js (raiz) é compilado pra AMBOS runtimes
  // (Node e Edge). O guard real que evita o build do Edge tracejar sharp está
  // no PRÓPRIO instrumentation.js: `if (process.env.NEXT_RUNTIME === 'nodejs')`
  // ENVOLVENDO o `await import('./server/instrumentation.js')`. Esse é o fix
  // primário (vercel/next.js#49565). As configs abaixo são defesa em profundidade.
  //
  // 1. Node runtime: pacotes nativos como `externals` — não bundlar, require em
  //    runtime. Cobre módulos nativos que o webpack não consegue analisar.
  // 2. Edge runtime: fallback `false` pros módulos Node-only. Redundante com o
  //    guard mas mantém o build do Edge robusto se o guard for esquecido.
  webpack: (config, { nextRuntime, isServer }) => {
    if (nextRuntime === 'nodejs') {
      const nativeExternals = {
        sharp:        'commonjs sharp',
        'pdf-parse':  'commonjs pdf-parse',
        mammoth:      'commonjs mammoth',
      };
      if (Array.isArray(config.externals)) {
        config.externals.push(nativeExternals);
      } else if (typeof config.externals === 'function') {
        const original = config.externals;
        config.externals = [original, nativeExternals];
      } else {
        config.externals = [config.externals, nativeExternals].filter(Boolean);
      }
    }
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        crypto:                              false,
        fs:                                  false,
        'fs/promises':                       false,
        path:                                false,
        stream:                              false,
        buffer:                              false,
        os:                                  false,
        child_process:                       false,
        sharp:                               false,
        'pdf-parse':                         false,
        mammoth:                             false,
        '@img/sharp-libvips-dev/include':    false,
        '@img/sharp-libvips-dev/cplusplus':  false,
        '@img/sharp-wasm32/versions':        false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
