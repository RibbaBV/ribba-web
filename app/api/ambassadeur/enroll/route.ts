// POST /api/ambassadeur/enroll — meld een ingelogde leerling aan als
// ambassadeur van Ribba. Maakt zo nodig de partner-rij aan (dezelfde
// uitbetaalidentiteit als het rijschool-referralprogramma), genereert een
// unieke code en legt vast met welke versie van de voorwaarden hij akkoord
// ging. Idempotent: wie al meedoet krijgt zijn bestaande code terug.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/partner-auth';
import { rateLimit } from '@/lib/rate-limit';
import { genereerCode, leesCampagne } from '@/lib/ribba-ambassadeur';
import { tipLink } from '@/lib/ribba-tip';
import { stuurAmbassadeurWelkomMail } from '@/lib/ambassadeur-emails';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`ambassadeur-enroll:${ip}`, { maxRequests: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Te veel verzoeken. Probeer het later opnieuw.' }, { status: 429 });
  }

  const authed = await getAuthedUser(req);
  if (!authed) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  const { user, supabase } = authed;
  if (!user.email) {
    return NextResponse.json({ error: 'Account zonder e-mailadres.' }, { status: 400 });
  }

  try {
    const campagne = await leesCampagne(supabase);
    if (!campagne || campagne.status !== 'active') {
      return NextResponse.json(
        { error: 'Het ambassadeursprogramma is op dit moment gesloten.' },
        { status: 404 },
      );
    }

    // Partner-rij: de uitbetaalidentiteit. Bestaat al wanneer deze leerling
    // ook partner is van zijn eigen rijschool; dan hergebruiken we hem, zodat
    // hij niet een tweede keer door de Stripe-verificatie hoeft.
    const { error: partnerFout } = await supabase
      .from('referral_partners')
      .upsert(
        { user_id: user.id, email: user.email.toLowerCase() },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (partnerFout) {
      console.error('ambassadeur-enroll: partner upsert mislukt', partnerFout.message);
      return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
    }
    const { data: partner } = await supabase
      .from('referral_partners')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!partner) return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });

    const { data: bestaand } = await supabase
      .from('ribba_ambassadeurs')
      .select('code, status')
      .eq('partner_id', partner.id)
      .maybeSingle();

    if (bestaand) {
      if (bestaand.status !== 'active') {
        return NextResponse.json({ error: 'Je deelname is ingetrokken.' }, { status: 403 });
      }
      return NextResponse.json({
        code: bestaand.code,
        tip_link: tipLink(bestaand.code),
        beloning_cents: campagne.beloning_cents,
        bestond_al: true,
      });
    }

    // Nieuwe deelname met unieke code. 23505 is een codebotsing: opnieuw
    // proberen. Botst het op partner_id, dan won een gelijktijdige aanroep en
    // vangt de bestaande-check hierboven de volgende keer.
    let code = '';
    let gelukt = false;
    for (let poging = 0; poging < 5 && !gelukt; poging++) {
      code = genereerCode();
      const { error } = await supabase.from('ribba_ambassadeurs').insert({
        partner_id: partner.id,
        code,
        akkoord_versie: campagne.voorwaarden_versie,
      });
      if (error) {
        if (error.code === '23505') continue;
        console.error('ambassadeur-enroll: insert mislukt', error.message);
        return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
      }
      gelukt = true;
    }
    if (!gelukt) {
      return NextResponse.json({ error: 'Er ging iets mis. Probeer het opnieuw.' }, { status: 500 });
    }

    await stuurAmbassadeurWelkomMail({
      email: user.email.toLowerCase(),
      tipLink: tipLink(code),
      beloningCents: campagne.beloning_cents,
      attributieDagen: campagne.attributie_dagen,
    });

    return NextResponse.json({
      code,
      tip_link: tipLink(code),
      beloning_cents: campagne.beloning_cents,
      bestond_al: false,
    });
  } catch (e) {
    console.error('ambassadeur-enroll fout:', e);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
