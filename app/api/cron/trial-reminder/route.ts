// Daily trial reminder: stuur rijscholen waarvan de proefperiode over 7 of
// 1 dag afloopt een herinneringsmail met link naar /upgrade.
//
// Twee groepen, twee mails:
//
//   1. scholen ZONDER abonnement (oude proef, `is_trial = true`): "kies een
//      abonnement". Ongewijzigd.
//   2. scholen MET een Stripe-abonnement in de gratis periode (`trialing`):
//      "je abonnement loopt door". Deze groep viel tot 2 okt 2026 buiten elke
//      herinnering, omdat een school met mandaat direct `is_trial = false`
//      krijgt. De feiten komen rechtstreeks uit Stripe; de spiegel levert
//      alleen de lijst. Zie lib/free-period-reminder.ts voor het waarom.
//
// Dit blijft de enige eigenaar van proefmails; er komt geen tweede cron.
//
// Auth: Vercel Cron stuurt automatisch `Authorization: Bearer ${CRON_SECRET}`.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendFreePeriodEndingMail, sendTrialEndingReminderMail } from '@/lib/school-emails';
import { getStripe } from '@/lib/stripe';
import {
  alreadySent,
  reminderEmailType,
  selectFreePeriodReminders,
  subscriptionRowFromStripe,
  type SkippedRow,
  type StripeSubscriptionLike,
  type SubscriptionRow,
} from '@/lib/free-period-reminder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// YYYY-MM-DD voor `n` dagen vanaf nu (UTC).
function dateInDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const targets: Array<{ days: number; date: string }> = [
    { days: 7, date: dateInDays(7) },
    { days: 1, date: dateInDays(1) },
  ];

  const sent: Array<{ school_id: string; days: number; email: string }> = [];
  const failed: Array<{ school_id: string; days: number; reason: string }> = [];

  for (const { days, date } of targets) {
    // trial_ends_at valt op `date` (UTC) → range [date 00:00, date+1 00:00)
    const start = `${date}T00:00:00Z`;
    const endDate = new Date(`${date}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = endDate.toISOString();

    const { data: licenses, error } = await supabase
      .from('instructor_licenses')
      .select('id, school_id, trial_ends_at')
      .eq('status', 'active')
      .eq('is_trial', true)
      .gte('trial_ends_at', start)
      .lt('trial_ends_at', end);

    if (error) {
      console.error(`trial-reminder: query failed for day=${days}`, error);
      continue;
    }

    for (const license of licenses ?? []) {
      const { data: school } = await supabase
        .from('drivingschools')
        .select('id, name, email')
        .eq('id', license.school_id)
        .maybeSingle();

      if (!school?.email) {
        failed.push({ school_id: license.school_id, days, reason: 'no email' });
        continue;
      }

      try {
        await sendTrialEndingReminderMail(school.id, school.email, school.name, days);
        sent.push({ school_id: school.id, days, email: school.email });
        console.log(`trial-reminder: sent to ${school.email} (${days} days left)`);
      } catch (e) {
        failed.push({ school_id: school.id, days, reason: String(e).slice(0, 200) });
        console.error(`trial-reminder: send failed for ${school.email}:`, e);
      }
    }
  }

  // ── Groep 2: scholen met een Stripe-abonnement in de gratis periode ──────
  //
  // Los van groep 1 en erna, zodat een fout hier de bestaande mails niet raakt.
  // Geen overlap mogelijk: groep 1 is `is_trial = true`, en een `trialing`
  // abonnement zet de licentie op `is_trial = false`.
  let skipped: SkippedRow[] = [];
  const now = new Date();
  const { data: subs, error: subsError } = await supabase
    .from('school_subscriptions')
    .select('school_id, stripe_subscription_id')
    .eq('stripe_status', 'trialing');

  if (subsError) {
    console.error('trial-reminder: school_subscriptions query failed', subsError);
  } else {
    // De spiegel zegt alleen WIE. Wat er waar is, vragen we Stripe — per
    // abonnement, en een mislukte opvraging raakt alleen die ene school.
    const feiten: SubscriptionRow[] = [];
    for (const rij of (subs ?? []) as Array<{ school_id: string | null; stripe_subscription_id: string | null }>) {
      if (!rij.school_id || !rij.stripe_subscription_id) continue;
      try {
        const sub = await getStripe().subscriptions.retrieve(rij.stripe_subscription_id);
        feiten.push(subscriptionRowFromStripe(rij.school_id, sub as unknown as StripeSubscriptionLike));
      } catch (e) {
        failed.push({ school_id: rij.school_id, days: 0, reason: `stripe lookup failed: ${String(e).slice(0, 160)}` });
        console.error('trial-reminder: stripe lookup failed', rij.school_id, e);
      }
    }
    // Eén regel per dag in de log: hoeveel gratis periodes Stripe kent en
    // wanneer de eerstvolgende afloopt. Zo is op elke gewone dag zichtbaar dat
    // de opvraging werkt, niet pas op de dag dat er een mail uit moet.
    const einddata = feiten
      .filter((f) => f.stripe_status === 'trialing' && f.current_period_end)
      .map((f) => f.current_period_end as string)
      .sort();
    console.log(`trial-reminder: ${einddata.length} gratis periode(s) in beeld; eerstvolgende einde: ${einddata[0] ?? 'geen'}`);

    const selectie = selectFreePeriodReminders(feiten, now);
    skipped = selectie.skipped;

    for (const reminder of selectie.reminders) {
      const days = reminder.daysLeft;
      const { data: school } = await supabase
        .from('drivingschools')
        .select('id, name, email')
        .eq('id', reminder.schoolId)
        .maybeSingle();

      if (!school?.email) {
        failed.push({ school_id: reminder.schoolId, days, reason: 'no email' });
        continue;
      }

      // Niet twee keer dezelfde mail. Kunnen we dat niet nagaan, dan versturen
      // we NIET: een gemiste herinnering is te herstellen, een dubbele mail
      // over een incasso niet.
      const { data: eerder, error: eerderError } = await supabase
        .from('billing_events')
        .select('created_at')
        .eq('school_id', reminder.schoolId)
        .eq('event_type', 'email_sent')
        .eq('email_type', reminderEmailType(days));
      if (eerderError) {
        failed.push({ school_id: reminder.schoolId, days, reason: 'dedup check failed' });
        console.error('trial-reminder: dedup check failed', reminder.schoolId, eerderError);
        continue;
      }
      if (alreadySent((eerder ?? []).map((r: { created_at: string | null }) => r.created_at), now)) {
        skipped.push({ schoolId: reminder.schoolId, reason: 'already_sent' });
        continue;
      }

      try {
        await sendFreePeriodEndingMail(school.email, school.name, reminder);
        sent.push({ school_id: school.id, days, email: school.email });
        console.log(`trial-reminder: free-period mail sent to ${school.email} (${days} days left)`);
      } catch (e) {
        failed.push({ school_id: school.id, days, reason: String(e).slice(0, 200) });
        console.error(`trial-reminder: free-period send failed for ${school.email}:`, e);
      }
    }
  }

  return NextResponse.json({
    sent_count: sent.length,
    failed_count: failed.length,
    skipped_count: skipped.length,
    sent,
    failed,
    skipped,
  });
}
