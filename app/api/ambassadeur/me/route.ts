// GET /api/ambassadeur/me — alles wat de ambassadeurspagina toont: de eigen
// tiplink, de rijscholen die via die link binnenkwamen, en het geld
// (klaarstaand, onderweg, uitbetaald). Geeft `ambassadeur: null` terug voor
// wie is ingelogd maar nog niet meedoet; de pagina biedt dan het meedoen aan.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/partner-auth';
import { beloningIsVrij, leesCampagne } from '@/lib/ribba-ambassadeur';
import { tipLink } from '@/lib/ribba-tip';
import type { TipRow, UitbetalingRow } from '@/lib/ribba-ambassadeur-types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 });
  const { user, supabase } = authed;

  try {
    const campagne = await leesCampagne(supabase);

    const { data: partner } = await supabase
      .from('referral_partners')
      .select('id, email, payouts_enabled, stripe_onboarding_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!partner) {
      return NextResponse.json({ ambassadeur: null, campagne });
    }

    const { data: amb } = await supabase
      .from('ribba_ambassadeurs')
      .select('id, code, status, akkoord_versie, created_at')
      .eq('partner_id', partner.id)
      .maybeSingle();

    if (!amb) {
      return NextResponse.json({ ambassadeur: null, campagne });
    }

    const { data: tips } = await supabase
      .from('ribba_referrals')
      .select('id, school_naam, status, beloning_cents, aangemeld_op, verdiend_op')
      .eq('ambassadeur_id', amb.id)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: uitbetalingen } = await supabase
      .from('ribba_referral_payouts')
      .select('id, referral_id, amount_cents, status, vrij_op, geclaimd_op, uitbetaald_op, mislukking_reden, created_at')
      .eq('ambassadeur_id', amb.id)
      .order('created_at', { ascending: false })
      .limit(100);

    const rijen = (uitbetalingen ?? []) as Array<Pick<UitbetalingRow,
      'id' | 'referral_id' | 'amount_cents' | 'status' | 'vrij_op' | 'geclaimd_op' | 'uitbetaald_op' | 'mislukking_reden' | 'created_at'>>;
    const som = (statussen: string[]) => rijen
      .filter((r) => statussen.includes(r.status))
      .reduce((t, r) => t + r.amount_cents, 0);

    // Verdiend geld valt uiteen in wat nu opgehaald kan worden en wat nog in de
    // wachttijd zit. Die twee op één hoop zou een knop opleveren die minder
    // overmaakt dan het bedrag ernaast, en dat leest als een fout.
    const nu = new Date();
    const vrij = (r: { vrij_op: string | null }) => beloningIsVrij(r.vrij_op, nu);
    const teInnen = rijen.filter((r) => r.status === 'te_innen');
    const nuTeInnen = teInnen.filter(vrij).reduce((t, r) => t + r.amount_cents, 0);
    const inWachttijd = teInnen.filter((r) => !vrij(r));
    // De eerstvolgende datum waarop er weer iets vrijkomt.
    const eerstVrijOp = inWachttijd
      .map((r) => r.vrij_op as string)
      .sort()[0] ?? null;

    return NextResponse.json({
      campagne,
      ambassadeur: {
        code: amb.code,
        status: amb.status,
        tip_link: tipLink(amb.code),
        email: partner.email,
        payouts_enabled: partner.payouts_enabled === true,
        stripe_onboarding_status: partner.stripe_onboarding_status,
        // Verificatie is pas nodig wanneer er iets te innen valt. Eerder
        // vragen is een drempel voor iets wat misschien nooit gebeurt.
        // Verificatie pas vragen wanneer er echt iets op te halen valt. Tijdens
        // de wachttijd is dat nog niet zo.
        verificatie_nodig: partner.payouts_enabled !== true && (nuTeInnen > 0 || som(['geclaimd']) > 0),
      },
      tips: (tips ?? []) as Array<Pick<TipRow,
        'id' | 'school_naam' | 'status' | 'beloning_cents' | 'aangemeld_op' | 'verdiend_op'>>,
      uitbetalingen: rijen,
      totalen: {
        te_innen_cents: nuTeInnen,
        in_wachttijd_cents: inWachttijd.reduce((t, r) => t + r.amount_cents, 0),
        eerst_vrij_op: eerstVrijOp,
        onderweg_cents: som(['geclaimd']),
        uitbetaald_cents: som(['uitbetaald']),
      },
    });
  } catch (e) {
    console.error('ambassadeur-me fout:', e);
    return NextResponse.json({ error: 'Er ging iets mis.' }, { status: 500 });
  }
}
