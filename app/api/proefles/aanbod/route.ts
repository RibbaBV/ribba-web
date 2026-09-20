// Gratis proefles — een rijschool reageert op een aanbod via de link uit de mail.
//
// Eén endpoint voor accepteren, afwijzen, annuleren en afmelden. Wie wint bij
// twee gelijktijdige acceptaties beslist de database (rijlock in
// proefles_aanbod_reageren_intern), niet deze route.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/marketplace-db';
import { extractIpAddress } from '@/lib/legal-acceptances';
import { AANBOD_ACTIES, isProeflesToken, type AanbodActie } from '@/lib/proefles';

export async function POST(request: NextRequest) {
  const ip = extractIpAddress(request) ?? 'unknown';
  if (!rateLimit(`proefles-aanbod:${ip}`, { maxRequests: 20, windowMs: 600_000 })) {
    return NextResponse.json({ error: 'Te veel verzoeken.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { token?: unknown; actie?: unknown } | null;
  if (!isProeflesToken(body?.token)) {
    return NextResponse.json({ uitkomst: 'niet_gevonden' }, { status: 404 });
  }
  if (typeof body.actie !== 'string' || !AANBOD_ACTIES.includes(body.actie as AanbodActie)) {
    return NextResponse.json({ error: 'Onbekende actie.' }, { status: 400 });
  }

  try {
    const { data, error } = await getServiceClient().rpc('proefles_aanbod_reageren', {
      p_token: body.token,
      p_actie: body.actie,
    });
    if (error) throw error;
    return NextResponse.json({ uitkomst: (data as { uitkomst: string }).uitkomst });
  } catch (err) {
    console.error('[proefles] reageren op aanbod faalde:', err);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
