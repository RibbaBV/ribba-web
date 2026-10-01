// De herinnering vóór het einde van de gratis periode — voor scholen MET een
// Stripe-abonnement (mandaat bij inschrijving).
//
// WAAROM DIT NAAST DE BESTAANDE TRIAL-REMINDER STAAT. De cron
// `/api/cron/trial-reminder` selecteerde op `instructor_licenses.is_trial`.
// Een school die zich met mandaat inschrijft staat direct als betaald geboekt
// (`is_trial = false`, door de €0-factuur bij de trialstart) en viel daardoor
// buiten elke herinnering. Gemeten 1 okt 2026 bij de eerste school uit die
// keten.
//
// Het is ook een ANDERE mail. De oude zegt "kies een abonnement, anders verlies
// je toegang". Voor een school met mandaat is dat onwaar: er verandert niets
// aan de toegang, het abonnement loopt door en wordt geïncasseerd. Dát moet de
// rijschool weten vóór het gebeurt.
//
// BRON VAN WAARHEID: STRIPE ZELF, NIET DE SPIEGEL. Status, einddatum, opzegging
// en plan komen uit de subscription zoals Stripe hem nu teruggeeft. De spiegel
// (`school_subscriptions`) levert alleen de lijst: welke school hoort bij welk
// abonnement.
//
// Dat is geen voorzichtigheid maar noodzaak. De activatie schrijft de
// spiegelrij zónder `current_period_end`, en die blijft leeg tot het volgende
// webhookevent — dat bij een gratis periode pas op de einddatum komt. Gemeten
// 2 okt 2026: Drive4License stond `trialing` met een lege einddatum, terwijl
// Stripe 25 oktober gaf. Wie de spiegel gelooft, slaat precies de scholen over
// voor wie deze mail bedoeld is. `trial_ends_at` op de licentie is evenmin
// bruikbaar: die wordt anders berekend en week bij Sezen een dag af.
//
// Pure module: geen I/O, geen env. De route doet het lezen en versturen.

import { isPaidPlan, type PaidPlan } from './plan-pricing';

/** Zelfde momenten als de bestaande trial-reminder. */
export const REMINDER_DAYS = [7, 1] as const;
export type ReminderDays = (typeof REMINDER_DAYS)[number];

export interface SubscriptionRow {
  school_id: string | null;
  stripe_status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
}

/** Het deel van een Stripe-subscription dat deze module leest. Geen SDK-type: pure module. */
export interface StripeSubscriptionLike {
  status?: string | null;
  trial_end?: number | null;
  cancel_at?: number | null;
  items?: {
    data?: Array<{ price?: { metadata?: Record<string, string> | null } | null } | null> | null;
  } | null;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Vertaalt wat Stripe teruggeeft naar de feiten waarop de selectie beslist.
 *
 * Het plan komt uit `metadata.plan` op de Price — dezelfde regel als in de
 * webhook van ribbaPro. Precies één item mag een plan dragen; nul of meer dan
 * één levert `plan: null`, en dan mailt de selectie niet.
 */
export function subscriptionRowFromStripe(
  schoolId: string,
  sub: StripeSubscriptionLike,
): SubscriptionRow {
  const plannen = (sub.items?.data ?? [])
    .map((item) => item?.price?.metadata?.plan)
    .filter((plan): plan is string => typeof plan === 'string' && plan !== '');
  return {
    school_id: schoolId,
    stripe_status: sub.status ?? null,
    plan: plannen.length === 1 ? plannen[0] : null,
    current_period_end: unixToIso(sub.trial_end),
    cancel_at: unixToIso(sub.cancel_at),
  };
}

export interface FreePeriodReminder {
  schoolId: string;
  plan: PaidPlan;
  daysLeft: ReminderDays;
  /** ISO-tijdstip waarop de gratis periode eindigt. */
  endsAt: string;
}

export type SkipReason =
  | 'cancellation_scheduled'
  | 'unknown_plan'
  | 'no_period_end'
  | 'duplicate_subscription'
  /** Gezet door de route, niet door de selectie: deze mail ging al de deur uit. */
  | 'already_sent';

export interface SkippedRow {
  schoolId: string | null;
  reason: SkipReason;
}

/** YYYY-MM-DD (UTC) voor `n` dagen na `now`. Zelfde rekenregel als de bestaande cron. */
export function utcDateInDays(now: Date, n: number): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Welke scholen krijgen vandaag de herinnering?
 *
 * Alleen `trialing`. Een opgezegd abonnement krijgt hem niet: dat loopt niet
 * door, dus "je abonnement loopt door" zou onwaar zijn — en die school heeft
 * zijn opzegbevestiging al.
 *
 * Eén mail per school. Twee `trialing`-abonnementen voor één school is zelf een
 * incident; dan mailen we één keer en melden het tweede als overgeslagen.
 */
export function selectFreePeriodReminders(
  rows: readonly SubscriptionRow[],
  now: Date,
): { reminders: FreePeriodReminder[]; skipped: SkippedRow[] } {
  const targets = REMINDER_DAYS.map((days) => ({ days, date: utcDateInDays(now, days) }));
  const reminders: FreePeriodReminder[] = [];
  const skipped: SkippedRow[] = [];
  const gezien = new Set<string>();

  for (const row of rows) {
    if (row.stripe_status !== 'trialing' || !row.school_id) continue;

    if (!row.current_period_end) {
      skipped.push({ schoolId: row.school_id, reason: 'no_period_end' });
      continue;
    }
    const eind = new Date(row.current_period_end);
    if (Number.isNaN(eind.getTime())) {
      skipped.push({ schoolId: row.school_id, reason: 'no_period_end' });
      continue;
    }
    const einddatum = eind.toISOString().split('T')[0];
    const target = targets.find((t) => t.date === einddatum);
    if (!target) continue; // gewoon nog niet aan de beurt

    if (row.cancel_at) {
      skipped.push({ schoolId: row.school_id, reason: 'cancellation_scheduled' });
      continue;
    }
    if (!isPaidPlan(row.plan)) {
      skipped.push({ schoolId: row.school_id, reason: 'unknown_plan' });
      continue;
    }
    if (gezien.has(row.school_id)) {
      skipped.push({ schoolId: row.school_id, reason: 'duplicate_subscription' });
      continue;
    }
    gezien.add(row.school_id);
    reminders.push({
      schoolId: row.school_id,
      plan: row.plan,
      daysLeft: target.days,
      endsAt: eind.toISOString(),
    });
  }
  return { reminders, skipped };
}

/** `email_type` in `billing_events`. Ook de sleutel waarop we dubbel versturen voorkomen. */
export function reminderEmailType(daysLeft: ReminderDays): string {
  return `free_period_ending_${daysLeft}d`;
}

/** "1 november 2026", in Nederlandse tijd — de rijschool leest geen UTC. */
export function formatEndDate(endsAt: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(endsAt));
}

const PLAN_LABEL: Record<PaidPlan, string> = { basic: 'Basic', premium: 'Premium' };

export interface ReminderCopy {
  subject: string;
  pillLabel: string;
  title: string;
  /** Wat er gebeurt. Altijd aanwezig. */
  intro: string;
  /**
   * Alleen bij Premium: de weg naar Basic.
   *
   * TIJDELIJK een mailadres. De knop "naar Basic" op de website bestaat nog
   * niet (ontwerp: ribbaPro PR #731). Zodra die er is, wijst deze zin naar de
   * website en vervalt het mailadres. Een mail die naar een knop verwijst die
   * er niet is, is erger dan een mail die om een mailtje vraagt.
   */
  switchToBasic: string | null;
  /** Hoe je voorkomt dat het doorloopt. Altijd aanwezig. */
  cancel: string;
  ctaLabel: string;
}

/**
 * De tekst van de mail.
 *
 * Wat hier bewust NIET staat: een bedrag bij een datum ("op 1 november
 * schrijven we €54,45 af"). Ribba weet niet zeker wat Stripe int — een
 * afwijkende prijs of korting leeft daar. De mail noemt het plan en laat de
 * tarieven als tarieven zien.
 */
export function buildReminderCopy(input: {
  plan: PaidPlan;
  daysLeft: ReminderDays;
  endsAt: string;
}): ReminderCopy {
  const plan = PLAN_LABEL[input.plan];
  const datum = formatEndDate(input.endsAt);
  const morgen = input.daysLeft <= 1;
  const wanneer = morgen ? 'morgen' : `over ${input.daysLeft} dagen`;

  return {
    subject: `Je gratis periode loopt ${wanneer} af`,
    pillLabel: morgen ? 'Loopt morgen af' : `Nog ${input.daysLeft} dagen`,
    title: `Je gratis periode loopt ${wanneer} af`,
    intro:
      `Je gratis periode bij Ribba loopt af op ${datum}. Je hoeft niets te doen: `
      + `je abonnement loopt daarna door op ${plan} en wordt maandelijks automatisch geïncasseerd.`,
    switchToBasic: input.plan === 'premium'
      ? (morgen
        ? 'Liever Basic? Mail ons vandaag nog op team@ribba.nl, dan zetten we je abonnement om.'
        : `Liever Basic? Mail ons vóór ${datum} op team@ribba.nl, dan zetten we je abonnement om.`)
      : null,
    cancel: morgen
      ? 'Wil je niet doorgaan? Zeg dan vandaag nog op via de knop hieronder.'
      : `Wil je niet doorgaan? Zeg dan vóór ${datum} op via de knop hieronder.`,
    ctaLabel: 'Bekijk je abonnement',
  };
}

/**
 * Is deze mail al verstuurd? De cron kan dubbel worden afgeleverd of met de
 * hand opnieuw worden aangeroepen; een tweede mail over een incasso is precies
 * het soort bericht dat een rijschool ongerust maakt.
 *
 * `sentAt` is de `created_at` van eerdere `email_sent`-regels met hetzelfde
 * `email_type` voor deze school. Het venster is ruim genoeg voor een herhaalde
 * run en krap genoeg om een volgende gratis periode niet te blokkeren.
 */
export const DEDUP_WINDOW_DAYS = 3;

export function alreadySent(sentAt: readonly (string | null | undefined)[], now: Date): boolean {
  const grens = now.getTime() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return sentAt.some((s) => {
    if (!s) return false;
    const t = new Date(s).getTime();
    return !Number.isNaN(t) && t >= grens;
  });
}
