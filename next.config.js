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

const nextConfig = {
  allowedDevOrigins,
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
    ],
  },
};

module.exports = nextConfig;
