import { NextResponse } from 'next/server';

// Ook weigeringen en storingen mogen niet in een browser- of gedeelde cache
// terechtkomen. Elke supportroute gebruikt daarom dezelfde antwoordfunctie.
export function supportJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Vary': 'Authorization',
    },
  });
}
