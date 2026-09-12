// Dagelijkse verwerking van het Ribba Ambassadeursprogramma (Vercel Cron,
// CRON_SECRET-bearer):
//
//   1. verdiend-mails: een ambassadeur weet pas dat er geld klaarstaat als we
//      het hem vertellen. `verdiend_mail_op` is de marker;
//   2. transfers: geclaimde uitbetalingen gaan vanaf het platformsaldo naar
//      het Express-account van de ambassadeur;
//   3. terugboekingen: een beloning die nog in de wachttijd staat intrekken
//      zodra de rijschool per saldo niets meer betaald heeft;
//   4. naveging: tips die volgens de database nog niet betaald zijn, maar
//      waarvan de rijschool bij Stripe wel een betaalde factuur heeft.
//
// WAAROM DIT SIMPELER IS DAN DE REFERRAL-CRON. Daar incasseert Ribba eerst bij
// de rijschool via SEPA en wacht dan dagen op settlement. Hier is Ribba zelf
// de betaler: er valt niets te incasseren, dus er is één stap en geen
// asynchrone tussenstand.
//
// WAAROM DE TRANSFER VOOR DE STATUSUPDATE KOMT. Een Stripe-transfer met een
// idempotency-key per payout kan niet dubbel uitgevoerd worden: een tweede
// aanroep met dezelfde key levert dezelfde transfer op. De volgorde
// "eerst overmaken, dan de status verzetten" kan dus hooguit leiden tot een
// payout die nog een keer langskomt, niet tot geld dat twee keer weggaat.
// Andersom zou een crash na de statusupdate iemand zijn geld kosten.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe';
import {
  stuurAmbassadeurUitbetaaldMail,
  stuurAmbassadeurVerdiendMail,
} from '@/lib/ambassadeur-emails';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hoe lang een tip mag staan voordat de naveging hem bij Stripe natrekt. */
const NAVEEG_UITSTEL_MINUTEN = 60;
const NAVEEG_MAX = 50;
/** Hoeveel openstaande beloningen per run bij Stripe worden nagetrokken. */
const TERUGBOEKING_MAX = 100;

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const nu = new Date().toISOString();
  const samenvatting = {
    verdiend_mails: 0,
    transfers: 0,
    transfers_mislukt: 0,
    nagevegen: 0,
    ingetrokken: 0,
    overgeslagen: [] as Array<{ payout_id: string; reden: string }>,
  };

  // ── 1. Verdiend-mails ─────────────────────────────────────────────────────
  const { data: onaangekondigd } = await supabase
    .from('ribba_referral_payouts')
    .select('id, referral_id, partner_id, amount_cents, vrij_op')
    .is('verdiend_mail_op', null)
    .in('status', ['te_innen', 'geclaimd'])
    .limit(200);

  for (const payout of onaangekondigd ?? []) {
    const { data: tip } = await supabase
      .from('ribba_referrals').select('school_naam').eq('id', payout.referral_id).maybeSingle();
    const { data: partner } = await supabase
      .from('referral_partners').select('email').eq('id', payout.partner_id).maybeSingle();
    if (!partner?.email) {
      samenvatting.overgeslagen.push({ payout_id: payout.id, reden: 'geen_e-mailadres' });
      continue;
    }
    const verstuurd = await stuurAmbassadeurVerdiendMail({
      email: partner.email,
      schoolNaam: tip?.school_naam ?? 'de rijschool die je tipte',
      bedragCents: payout.amount_cents,
      vrijOp: payout.vrij_op ?? null,
    });
    // Alleen markeren bij een geslaagde verzending: een mislukte mail moet
    // morgen opnieuw langskomen, want dit is het enige bericht dat iemand
    // vertelt dat er geld voor hem klaarstaat.
    if (verstuurd) {
      await supabase
        .from('ribba_referral_payouts')
        .update({ verdiend_mail_op: nu })
        .eq('id', payout.id);
      samenvatting.verdiend_mails++;
    }
  }

  // ── 2. Transfers ──────────────────────────────────────────────────────────
  const { data: geclaimd } = await supabase
    .from('ribba_referral_payouts')
    .select('id, partner_id, amount_cents, currency, poging_aantal')
    .eq('status', 'geclaimd')
    .limit(100);

  if ((geclaimd ?? []).length > 0) {
    const stripe = getStripe();
    for (const payout of geclaimd ?? []) {
      const { data: partner } = await supabase
        .from('referral_partners')
        .select('email, stripe_account_id, payouts_enabled')
        .eq('id', payout.partner_id)
        .maybeSingle();

      // Nooit overmaken naar een account dat niet kan ontvangen. De payout
      // blijft geclaimd staan en komt morgen terug; de ambassadeur ziet in de
      // portal dat zijn verificatie nog open staat.
      if (!partner?.stripe_account_id || partner.payouts_enabled !== true) {
        samenvatting.overgeslagen.push({ payout_id: payout.id, reden: 'verificatie_niet_afgerond' });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create(
          {
            amount: payout.amount_cents,
            currency: payout.currency,
            destination: partner.stripe_account_id,
            description: 'Ribba ambassadeursbeloning',
            metadata: { ribba_payout_id: payout.id },
          },
          { idempotencyKey: `ribba-ambassadeur-payout-${payout.id}` },
        );

        await supabase
          .from('ribba_referral_payouts')
          .update({
            status: 'uitbetaald',
            stripe_transfer_id: transfer.id,
            uitbetaald_op: nu,
            mislukking_reden: null,
          })
          .eq('id', payout.id)
          .eq('status', 'geclaimd');

        if (partner.email) {
          await stuurAmbassadeurUitbetaaldMail({
            email: partner.email,
            bedragCents: payout.amount_cents,
          });
        }
        samenvatting.transfers++;
      } catch (e) {
        const reden = e instanceof Error ? e.message : String(e);
        console.error(`ribba-ambassadeur-payouts: transfer ${payout.id} mislukt`, reden);
        await supabase
          .from('ribba_referral_payouts')
          .update({
            status: 'mislukt',
            mislukt_op: nu,
            mislukking_reden: reden.slice(0, 500),
            poging_aantal: payout.poging_aantal + 1,
          })
          .eq('id', payout.id)
          .eq('status', 'geclaimd');
        samenvatting.transfers_mislukt++;
      }
    }
  }

  // ── 3. Terugboekingen ─────────────────────────────────────────────────────
  // Ribba geeft 60 dagen geld terug. Vraagt een rijschool zijn geld terug, dan
  // hoort de beloning die daaruit voortkwam te vervallen. Dat kan zolang hij
  // nog niet is overgemaakt, en daar is de wachttijd van 30 dagen voor.
  //
  // WAAROM HIER EN NIET IN DE STRIPE-WEBHOOK. Een geld-terug-actie loopt als
  // een refund, en de webhook in ribbaPro luistert niet naar `charge.refunded`.
  // Die keten verwerkt alle abonnementsbetalingen; er een eventtype bij hangen
  // is een zwaardere ingreep dan een stap in een cron die toch al met Stripe
  // praat.
  //
  // De maat is niet "is er iets teruggeboekt" maar "heeft deze rijschool per
  // saldo nog betaald". Dat vangt een gedeeltelijke terugboeking, een dispute
  // en een creditering in één som, zonder dat we elk eventtype apart hoeven te
  // kennen.
  const { data: openstaand } = await supabase
    .from('ribba_referral_payouts')
    .select('id, referral_id, status')
    .in('status', ['te_innen', 'geclaimd'])
    .limit(TERUGBOEKING_MAX);

  if ((openstaand ?? []).length > 0) {
    const stripe = getStripe();
    for (const payout of openstaand ?? []) {
      try {
        const { data: tip } = await supabase
          .from('ribba_referrals')
          .select('school_id')
          .eq('id', payout.referral_id)
          .maybeSingle();
        if (!tip?.school_id) continue;

        const { data: abo } = await supabase
          .from('school_subscriptions')
          .select('stripe_customer_id')
          .eq('school_id', tip.school_id)
          .not('stripe_customer_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!abo?.stripe_customer_id) continue;

        const charges = await stripe.charges.list({ customer: abo.stripe_customer_id, limit: 20 });
        const geslaagd = charges.data.filter((c) => c.status === 'succeeded');
        // Geen enkele geslaagde afschrijving gezien? Dan weten we niets en
        // trekken we niets in. Alleen een aantoonbaar leeg saldo telt.
        if (geslaagd.length === 0) continue;
        const netto = geslaagd.reduce(
          (t, c) => t + (c.amount - (c.amount_refunded ?? 0) - (c.disputed ? c.amount : 0)),
          0,
        );
        if (netto > 0) continue;

        const { error } = await supabase.rpc('ribba_referral_trek_in', {
          p_school_id: tip.school_id,
          p_reden: 'betaling teruggeboekt of betwist bij Stripe',
        });
        if (error) {
          console.error('ribba-ambassadeur-payouts: intrekken mislukt', payout.id, error.message);
          continue;
        }
        samenvatting.ingetrokken++;
      } catch (e) {
        console.error('ribba-ambassadeur-payouts: terugboekingscheck fout', payout.id, String(e).slice(0, 200));
      }
    }
  }

  // ── 4. Naveging van gemiste verdienmomenten ───────────────────────────────
  // De webhook markeert het verdienmoment, maar mag daarvoor nooit een betaling
  // laten mislukken: gaat de RPC daar stuk, dan blijft het bij een incident.
  // Hier halen we die gevallen alsnog op, bij de bron.
  const grens = new Date(Date.now() - NAVEEG_UITSTEL_MINUTEN * 60 * 1000).toISOString();
  const { data: openTips } = await supabase
    .from('ribba_referrals')
    .select('id, school_id')
    .eq('status', 'aangemeld')
    .not('school_id', 'is', null)
    .lt('aangemeld_op', grens)
    .limit(NAVEEG_MAX);

  if ((openTips ?? []).length > 0) {
    const stripe = getStripe();
    for (const tip of openTips ?? []) {
      try {
        const { data: abo } = await supabase
          .from('school_subscriptions')
          .select('stripe_subscription_id')
          .eq('school_id', tip.school_id)
          .not('stripe_subscription_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!abo?.stripe_subscription_id) continue;

        const facturen = await stripe.invoices.list({
          subscription: abo.stripe_subscription_id,
          status: 'paid',
          limit: 10,
        });
        const betaald = facturen.data.find((f) => (f.amount_paid ?? 0) > 0);
        if (!betaald) continue;

        const { error } = await supabase.rpc('ribba_referral_markeer_verdiend', {
          p_school_id: tip.school_id,
          p_stripe_invoice_id: betaald.id,
          p_bedrag_cents: betaald.amount_paid,
        });
        if (error) {
          console.error('ribba-ambassadeur-payouts: naveging mislukt', tip.id, error.message);
          continue;
        }
        samenvatting.nagevegen++;
      } catch (e) {
        console.error('ribba-ambassadeur-payouts: naveging fout', tip.id, String(e).slice(0, 200));
      }
    }
  }

  return NextResponse.json({ ok: true, ...samenvatting });
}
