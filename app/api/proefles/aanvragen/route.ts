// Gratis proefles — aanvraag indienen.
//
// Publiek endpoint voor de flow op /proefles. Doet de vormcontrole, bouwt de
// toestemming (versies van voorwaarden en privacy, IP, user agent) en roept
// public.proefles_aanvraag_indienen aan. Daarna gebeurt er niets tot de
// leerling op de link in de bevestigingsmail klikt: die mail plant de
// database zelf in, de edge function proefles-mails verstuurt hem.
//
// Contract: ribbaPro supabase/migrations/20260912140000_gratis_proefles.sql.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/marketplace-db';
import { LEGAL_VERSIONS } from '@/lib/legal-versions';
import { extractIpAddress, extractUserAgent } from '@/lib/legal-acceptances';
import { sanitizeBron, valideerAanvraag, type IndienUitkomst } from '@/lib/proefles';

const UITKOMSTEN: readonly IndienUitkomst[] = [
  'ingediend', 'al_actief', 'te_vaak', 'ongeldig_tijdslot',
  'toestemming_ontbreekt', 'ongeldige_gegevens', 'niet_beschikbaar',
];

export async function POST(request: NextRequest) {
  const ip = extractIpAddress(request) ?? 'unknown';
  if (!rateLimit(`proefles-aanvraag:${ip}`, { maxRequests: 5, windowMs: 3_600_000 })) {
    return NextResponse.json({ uitkomst: 'te_vaak' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ uitkomst: 'ongeldige_gegevens' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ uitkomst: 'ongeldige_gegevens' }, { status: 400 });
  }

  // Honeypot: een verborgen veld dat mensen niet zien. Gevuld → bot. Zelfde
  // antwoord als een echte aanvraag, zodat een bot er niets van leert.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ uitkomst: 'ingediend' });
  }

  const check = valideerAanvraag(body);
  if (!check.ok) {
    const uitkomst = check.fout.veld === 'toestemming' ? 'toestemming_ontbreekt' : 'ongeldige_gegevens';
    return NextResponse.json({ uitkomst, veld: check.fout.veld, melding: check.fout.melding }, { status: 400 });
  }
  const i = check.invoer;

  try {
    const { data, error } = await getServiceClient().rpc('proefles_aanvraag_indienen', {
      p_naam: i.naam,
      p_email: i.email,
      p_telefoon: i.telefoon,
      p_adres: i.adres,
      p_plaats: i.plaats,
      p_lat: i.lat,
      p_lon: i.lon,
      p_start_at: i.start_at,
      p_voorwaarden_versie: LEGAL_VERSIONS.terms,
      p_privacy_versie: LEGAL_VERSIONS.privacy,
      // De drie vinkjes zijn hierboven al afgedwongen; de database eist dit
      // derde akkoord expliciet nog een keer.
      p_delen_akkoord: true,
      p_ip: ip === 'unknown' ? null : ip,
      p_user_agent: extractUserAgent(request),
      p_bron: sanitizeBron(body.bron),
    });
    if (error) throw error;

    const uitkomst = (data as { uitkomst?: string } | null)?.uitkomst;
    if (!uitkomst || !UITKOMSTEN.includes(uitkomst as IndienUitkomst)) {
      console.error('[proefles] onverwachte uitkomst van proefles_aanvraag_indienen:', data);
      return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
    }
    // Het aanvraag-id gaat bewust niet terug naar de browser: er is niets dat
    // de leerling ermee kan, en alles loopt via de links in de mail.
    return NextResponse.json({ uitkomst });
  } catch (err) {
    console.error('[proefles] indienen faalde:', err);
    return NextResponse.json({ error: 'Er ging iets mis. Probeer het later opnieuw.' }, { status: 500 });
  }
}
