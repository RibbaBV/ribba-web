// Gratis proefles — de leerling annuleert via de link uit de mail.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/marketplace-db';
import { extractIpAddress } from '@/lib/legal-acceptances';
import { isProeflesToken } from '@/lib/proefles';

export async function POST(request: NextRequest) {
  const ip = extractIpAddress(request) ?? 'unknown';
  if (!rateLimit(`proefles-annuleren:${ip}`, { maxRequests: 20, windowMs: 600_000 })) {
    return NextResponse.json({ error: 'Te veel verzoeken.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!isProeflesToken(body?.token)) {
    return NextResponse.json({ uitkomst: 'niet_gevonden' }, { status: 404 });
  }

  try {
    const { data, error } = await getServiceClient().rpc('proefles_leerling_annuleren', { p_token: body.token });
    if (error) throw error;
    return NextResponse.json({ uitkomst: (data as { uitkomst: string }).uitkomst });
  } catch (err) {
    console.error('[proefles] annuleren faalde:', err);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
