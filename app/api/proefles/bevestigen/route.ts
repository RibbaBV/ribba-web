// Gratis proefles — e-mailadres bevestigen.
//
// Alleen POST. De pagina /proefles/bevestigen/[token] toont de aanvraag en
// een knop; pas die knop bevestigt. Mailscanners openen elke link in een mail,
// en een bevestiging door een scanner zou precies de spambescherming omzeilen
// waarvoor dit bevestigmoment bestaat.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/marketplace-db';
import { extractIpAddress } from '@/lib/legal-acceptances';
import { isProeflesToken } from '@/lib/proefles';

export async function POST(request: NextRequest) {
  const ip = extractIpAddress(request) ?? 'unknown';
  if (!rateLimit(`proefles-bevestigen:${ip}`, { maxRequests: 20, windowMs: 600_000 })) {
    return NextResponse.json({ error: 'Te veel verzoeken.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  if (!isProeflesToken(body?.token)) {
    return NextResponse.json({ uitkomst: 'niet_gevonden' }, { status: 404 });
  }

  try {
    const { data, error } = await getServiceClient().rpc('proefles_email_bevestigen', { p_token: body.token });
    if (error) throw error;
    const r = data as { uitkomst: string; status?: string; leerling_token?: string };
    return NextResponse.json({ uitkomst: r.uitkomst, leerling_token: r.leerling_token ?? null });
  } catch (err) {
    console.error('[proefles] bevestigen faalde:', err);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
