// Zelf overstappen tussen maandelijks en jaarlijks op /upgrade (F4, besluiten
// J6–J9) — UITSLUITEND lezen, teksten en de keuze wat de pagina toont. De
// wissel zelf (schedule, gratis periode, poorten) leeft in de ribbaPro edge
// function `stripe-change-plan` (acties `interval_schedule` / `interval_undo`).
//
// Productregels:
// - J6 maand → jaar: het jaar begint op de volgende incassodatum. Niets
//   verrekend, nu niets betaald. Intrekken kan tot die dag.
// - J7 jaar → maand: aan het einde van het betaalde jaar. Geen geld terug.
//   Intrekken kan tot die dag.
// - J8 in de gratis periode: direct, alleen de prijs wisselt; de gratis
//   periode blijft en de eerste incasso is aan het einde ervan.
// - Een geplande periodewissel en een geplande wissel naar Basic sluiten
//   elkaar uit (de server weigert met `interval_change_pending` /
//   `plan_change_pending`). De pagina biedt dan geen knop die gegarandeerd
//   faalt, maar zegt in één zin waarom het nu niet kan.

import {
  getPlanIntervalPricing,
  formatCentsForDisplay,
  isBillingInterval,
  isPaidPlan,
  perIntervalTekst,
  planExtraFeatures,
  type BillingInterval,
  type PaidPlan,
} from './plan-pricing';
import type { PlanSwitchStatus } from './plan-switch';

/** Een geplande wissel van betaalperiode, zoals Stripe hem kent. */
export type IntervalChange = { naar: BillingInterval; switchAt: string };

/** Wat de server zegt over de betaalperiode van het abonnement. */
export type IntervalStatus =
  | {
      known: true;
      /** Null: de server gaf geen periode mee (oudere server). */
      interval: BillingInterval | null;
      change: IntervalChange | null;
    }
  /** Geen antwoord, of een antwoord dat we niet eenduidig kunnen lezen. */
  | { known: false };

const leesbareDatum = (v: unknown): v is string => typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v));

/**
 * Leest `interval` en `interval_change` uit het status-antwoord.
 *
 * - Ontbreekt een veld (oudere server), dan is het null.
 * - Een ONBEKENDE waarde (een andere periode, een kapotte datum) maakt de hele
 *   stand onbekend: we raden niet, en tonen dan geen overstapknop.
 */
export function parseIntervalStatus(data: Record<string, unknown>): IntervalStatus {
  const ruwInterval = data.interval;
  let interval: BillingInterval | null = null;
  if (ruwInterval !== undefined && ruwInterval !== null) {
    if (!isBillingInterval(ruwInterval)) return { known: false };
    interval = ruwInterval;
  }

  const ruwChange = data.interval_change;
  let change: IntervalChange | null = null;
  if (ruwChange !== undefined && ruwChange !== null) {
    if (typeof ruwChange !== 'object' || Array.isArray(ruwChange)) return { known: false };
    const c = ruwChange as Record<string, unknown>;
    if (!isBillingInterval(c.naar) || !leesbareDatum(c.switch_at)) return { known: false };
    change = { naar: c.naar, switchAt: c.switch_at };
  }
  return { known: true, interval, change };
}

/** De andere periode. */
export function anderInterval(interval: BillingInterval): BillingInterval {
  return interval === 'jaar' ? 'maand' : 'jaar';
}

/** "maandelijks" / "jaarlijks". */
export function intervalBijwoord(interval: BillingInterval): string {
  return interval === 'jaar' ? 'jaarlijks' : 'maandelijks';
}

/** "€300" bij hele euro's, anders "€653,40". */
export function euroKort(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : formatCentsForDisplay(cents);
}

function datumNl(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(iso));
}

const metKleineLetter = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

// ── Teksten ─────────────────────────────────────────────────────────────────

/** "Je betaalt maandelijks: €45 per maand excl. btw." */
export function huidigePeriodeTekst(plan: PaidPlan, interval: BillingInterval): string {
  const p = getPlanIntervalPricing(plan, interval);
  return `Je betaalt ${intervalBijwoord(interval)}: ${euroKort(p.netCents)} ${perIntervalTekst(interval)} excl. btw.`;
}

/** De knop. */
export function overstapKnopTekst(naar: BillingInterval): string {
  return naar === 'jaar' ? 'Overstappen naar jaarlijks' : 'Terug naar maandelijks';
}

/** De titel van de bevestiging. */
export function overstapTitel(naar: BillingInterval): string {
  return naar === 'jaar' ? 'Overstappen naar jaarlijks?' : 'Terug naar maandelijks?';
}

/** "Per 1 november 2026 betaal je jaarlijks." */
export function geplandTekst(change: IntervalChange): string {
  return `Per ${datumNl(change.switchAt)} betaal je ${intervalBijwoord(change.naar)}.`;
}

/** De knop bij een geplande wissel: de huidige periode houden. */
export function intrekKnopTekst(change: IntervalChange): string {
  return `Toch ${intervalBijwoord(anderInterval(change.naar))} houden`;
}

/** Na een directe wissel in de gratis periode. */
export function directGewisseldTekst(naar: BillingInterval, nextInvoiceAt: string | null): string {
  const rest = nextInvoiceAt
    ? ` Je gratis periode blijft tot ${datumNl(nextInvoiceAt)}.`
    : ' Je gratis periode blijft zoals hij is.';
  return `Gelukt: je betaalt voortaan ${intervalBijwoord(naar)}.${rest}`;
}

/**
 * De tekst in de bevestiging. Bedragen uit plan-pricing (jaar = 12× maand).
 *
 * `datum` is de dag waarop het nieuwe bedrag ingaat: het einde van de gratis
 * periode, of het einde van de lopende betaalperiode. Onbekend → een zin
 * zonder datum, nooit een geraden datum.
 */
export function intervalConfirmText(opts: {
  plan: PaidPlan;
  naar: BillingInterval;
  inFreePeriod: boolean;
  datum: string | null;
}): string {
  const p = getPlanIntervalPricing(opts.plan, opts.naar);
  const bedrag = `${euroKort(p.netCents)} ${perIntervalTekst(opts.naar)} excl. btw (${euroKort(p.grossCents)} incl. btw)`;
  const d = opts.datum && leesbareDatum(opts.datum) ? datumNl(opts.datum) : null;

  // Wat er bij Premium bij komt of weggaat (J5: website-service alleen bij
  // Premium jaarlijks). De zin zelf komt uit plan-pricing.
  const extra = planExtraFeatures(opts.plan, opts.naar).map((t) => ` Daarbij: ${metKleineLetter(t)}.`).join('');
  const verlies = opts.plan === 'premium' && opts.naar === 'maand'
    ? ' De website-service hoort alleen bij jaarlijks betalen.'
    : '';

  if (opts.inFreePeriod) {
    const begin = d ? `Je gratis periode blijft tot ${d}.` : 'Je gratis periode blijft zoals hij is.';
    return `${begin} Daarna betaal je ${bedrag}.${extra}${verlies}`;
  }
  if (opts.naar === 'jaar') {
    const vanaf = d ? `Vanaf ${d}` : 'Vanaf je volgende betaaldatum';
    return `${vanaf} betaal je ${bedrag}. Tot die dag verandert er niets; intrekken kan tot dan.${extra}`;
  }
  const loopt = d ? `Je jaar loopt door tot ${d}.` : 'Je jaar loopt door tot het einde.';
  return `${loopt} Daarna betaal je ${bedrag}. Geld terug is er niet.${verlies}`;
}

/**
 * Zitten we in de gratis periode? De status-aanroep zegt dat niet; de
 * licentie wel (`trialEndsAt` in de toekomst). Weten we het niet, dan de
 * tekst voor betalend: die klopt ook in de gratis periode (de periode loopt
 * dan tot het einde van de gratis periode, en tot dan verandert er niets).
 */
export function inGratisPeriode(trialEndsAt: string | null, now: Date = new Date()): boolean {
  return Boolean(trialEndsAt && leesbareDatum(trialEndsAt) && Date.parse(trialEndsAt) > now.getTime());
}

// ── Wat de pagina toont ─────────────────────────────────────────────────────

export const PLANWISSEL_GEBLOKKEERD_DOOR_PERIODE = (naar: BillingInterval) =>
  `Je overstap naar ${intervalBijwoord(naar)} betalen staat gepland. Trek die eerst in om van plan te wisselen.`;

export const PERIODE_GEBLOKKEERD_DOOR_PLANWISSEL =
  'Je wissel naar Basic staat gepland. Trek die eerst in om je betaalperiode te wijzigen.';

export type IntervalView =
  /** Geen kaart: geen eigenaar, geen Stripe-abonnement, opgezegd, of stand onbekend. */
  | { kind: 'none' }
  /** De knop "Overstappen naar jaarlijks" / "Terug naar maandelijks". */
  | { kind: 'offer'; plan: PaidPlan; huidig: BillingInterval; naar: BillingInterval; geblokkeerd: string | null }
  /** "Per {datum} betaal je …" met de intrekknop. */
  | { kind: 'scheduled'; plan: PaidPlan; huidig: BillingInterval; change: IntervalChange };

export function intervalView(input: {
  canManageSubscription: boolean;
  currentPlan: string | null;
  isTrial: boolean;
  cancelled: boolean;
  /** De stand van de wissel naar Basic (zelfde status-aanroep). */
  planStatus: PlanSwitchStatus;
  status: IntervalStatus;
}): IntervalView {
  if (!input.canManageSubscription) return { kind: 'none' };
  // Een oude proef zonder Stripe-abonnement kiest de periode via de checkout.
  if (input.isTrial) return { kind: 'none' };
  // Opgezegd: de server weigert (`cancellation_pending`).
  if (input.cancelled) return { kind: 'none' };
  if (!isPaidPlan(input.currentPlan)) return { kind: 'none' };
  if (!input.status.known || input.status.interval === null) return { kind: 'none' };
  const plan = input.currentPlan;
  const huidig = input.status.interval;
  if (input.status.change) return { kind: 'scheduled', plan, huidig, change: input.status.change };
  const geblokkeerd = input.planStatus.known && input.planStatus.scheduled ? PERIODE_GEBLOKKEERD_DOOR_PLANWISSEL : null;
  return { kind: 'offer', plan, huidig, naar: anderInterval(huidig), geblokkeerd };
}

/**
 * Waarom een planwissel (naar Basic, of upgrade naar Premium) nu niet kan:
 * er staat een periodewissel gepland. Null = niets in de weg.
 */
export function planWisselGeblokkeerd(status: IntervalStatus): string | null {
  if (!status.known || !status.change) return null;
  return PLANWISSEL_GEBLOKKEERD_DOOR_PERIODE(status.change.naar);
}

// ── attempt_id ──────────────────────────────────────────────────────────────
//
// Zelfde regel als bij de checkout en de planwissel: één attempt_id per
// bewuste, bevestigde poging. Een netwerkfout hervat dezelfde poging (Stripe
// is idempotent op die sleutel); een ontvangen antwoord — gelukt of fout —
// sluit hem af. Een andere richting (`naar`) is altijd een nieuwe id: dezelfde
// sleutel met andere parameters weigert Stripe.

export type IntervalAttempts = {
  idVoor(naar: BillingInterval): string;
  /** Antwoord ontvangen (gelukt of definitieve fout): poging afgesloten. */
  afsluiten(): void;
};

export function createIntervalAttempts(genUuid: () => string = () => crypto.randomUUID()): IntervalAttempts {
  let huidig: { naar: BillingInterval; id: string } | null = null;
  return {
    idVoor(naar) {
      if (!huidig || huidig.naar !== naar) huidig = { naar, id: genUuid() };
      return huidig.id;
    },
    afsluiten() {
      huidig = null;
    },
  };
}
