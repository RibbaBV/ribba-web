import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zorg dat /join/* niet conflicteert met /[slug]
  // De volgorde in de app/ directory bepaalt prioriteit

  async headers() {
    return [
      ...['/support/:path*', '/api/support/:path*'].map((source) => ({
        source,
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      })),
      {
        // Apple Universal Links — moet als application/json geserveerd worden
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
      {
        // Android App Links assetlinks
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
    ];
  },
};

export default nextConfig;
