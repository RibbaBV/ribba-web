// POST /api/ambassadeur/innen — de ambassadeur haalt zijn geld op.
//
// Innen zet de payouts op `geclaimd`; de dagelijkse cron maakt daarna de
// Stripe-transfer. Bewust niet meteen overmaken vanuit deze request: een
// transfer die halverwege een HTTP-call mislukt laat een gebruiker met een
// spinner achter en ons met een onduidelijke status. De cron is de enige plek
// die geld verplaatst, en doet dat met een idempotency-key per payout.
//
// Zonder afgeronde Stripe-verificatie kan er niets overgemaakt worden. Dan
// weigeren we hier, in plaats van een claim aan te nemen die blijft hangen.
//
// Innen kan pas na de wachttijd (`vrij_op`). Ribba geeft 60 dagen geld terug;
// zonder die termijn zou een beloning al uitbetaald zijn tegen de tijd dat een
// rijschool zijn geld terugvraagt, en dan valt er niets meer te annuleren.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/partner-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`ambassadeur-innen:${ip}`, { maxRequests: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Te veel verzoeken. Probeer het later opnieuw.' }, { status: 429 });
  }

  const authed = await getAuthedUser(req);
  if (!authed) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  const { user, supabase } = authed;

  try {
    const { data: partner } = await supabase
      .from('referral_partners')
      .select('id, payouts_enabled')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!partner) {
      return NextResponse.json({ error: 'Geen ambassadeursprofiel gevonden.' }, { status: 404 });
    }
    if (partner.payouts_enabled !== true) {
      return NextResponse.json(
        { error: 'Rond eerst je verificatie bij Stripe af, anders kunnen we niets overmaken.' },
        { status: 409 },
      );
    }

    // Gefencede claim op de eigen rijen: `status = 'te_innen'` in de WHERE,
    // dus een tweede klik raakt nul rijen in plaats van iets dubbel te doen.
    //
    // De wachttijd zit in dezelfde WHERE en niet in een controle ervoor. Zou
    // hij ervoor staan, dan bepaalt de tijd tussen lezen en schrijven of een
    // beloning te vroeg vertrekt. `vrij_op is null` telt als vrij: dat zijn de
    // rijen van vóór de wachttijd.
    const nu = new Date().toISOString();
    const { data: geclaimd, error } = await supabase
      .from('ribba_referral_payouts')
      .update({ status: 'geclaimd', geclaimd_op: nu })
      .eq('partner_id', partner.id)
      .eq('status', 'te_innen')
      .or(`vrij_op.is.null,vrij_op.lte.${nu}`)
      .select('id, amount_cents');
    if (error) {
      console.error('ambassadeur-innen: claim mislukt', error.message);
      return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
    }

    const rijen = geclaimd ?? [];
    return NextResponse.json({
      aantal: rijen.length,
      bedrag_cents: rijen.reduce((t, r) => t + (r.amount_cents as number), 0),
    });
  } catch (e) {
    console.error('ambassadeur-innen fout:', e);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
