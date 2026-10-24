/**
 * Centrale prijs-Single-Source-of-Truth voor Ribba-abonnementen.
 *
 * BESLUIT (Önder, 12 jul 2026 — vastgelegd in ribbaPro
 * docs/architecture_decisions/2026-07-12-btw-abonnementsprijzen.md):
 * - Commerciële abonnementsprijzen zijn EXCLUSIEF 21% btw.
 * - Mollie incasseert het bruto bedrag (incl. btw): Basic €30,25 ·
 *   Premium €54,45.
 * - `instructor_licenses.price_per_month` bevat de NETTO maandprijs
 *   (excl. btw) — schrijf daar uitsluitend `netMonthlyEurosForDb()` heen.
 * - Onafhankelijke hardcoded prijsconstanten buiten dit bestand zijn
 *   verboden; onbekende plannen falen closed (UnknownPlanError).
 *
 * Alle geldberekeningen gebeuren in INTEGER CENTEN. Een decimaal getal
 * mag uitsluitend ontstaan aan een expliciete grens: de Mollie-API
 * (formatCentsForMollie), de database (netMonthlyEurosForDb) of
 * presentatie (formatCentsForDisplay).
 */

export const VAT_RATE_PERCENT = 21;

export type PaidPlan = 'basic' | 'premium';

const NET_MONTHLY_CENTS: Record<PaidPlan, number> = {
  basic: 2_500, // €25,00 excl. btw
  premium: 4_500, // €45,00 excl. btw
};

export class UnknownPlanError extends Error {
  constructor(plan: unknown) {
    super(
      `Onbekend abonnementsplan: ${String(plan)} — fail-closed, geen bedrag beschikbaar`,
    );
    this.name = 'UnknownPlanError';
  }
}

export function isPaidPlan(plan: unknown): plan is PaidPlan {
  return plan === 'basic' || plan === 'premium';
}

export interface PlanPricing {
  plan: PaidPlan;
  /** Commerciële maandprijs excl. btw, in centen (2500 = €25,00). */
  netMonthlyCents: number;
  /** 21% btw over de netto maandprijs, in centen. */
  vatCents: number;
  /** Wat Mollie daadwerkelijk incasseert (netto + btw), in centen. */
  grossMonthlyCents: number;
  vatRatePercent: typeof VAT_RATE_PERCENT;
}

/**
 * Enige toegestane bron van abonnementsbedragen.
 * Fail-closed: gooit UnknownPlanError bij elk onbekend/niet-betaald plan —
 * er bestaat bewust géén default- of fallback-bedrag.
 */
export function getPlanPricing(plan: unknown): PlanPricing {
  if (!isPaidPlan(plan)) {
    throw new UnknownPlanError(plan);
  }
  const netMonthlyCents = NET_MONTHLY_CENTS[plan];
  const vatCents = Math.round((netMonthlyCents * VAT_RATE_PERCENT) / 100);
  return {
    plan,
    netMonthlyCents,
    vatCents,
    grossMonthlyCents: netMonthlyCents + vatCents,
    vatRatePercent: VAT_RATE_PERCENT,
  };
}

/** Mollie-API-grens: exact decimaalformaat met punt, bv. 3025 → '30.25'. */
export function formatCentsForMollie(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Ongeldig centenbedrag voor Mollie: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

/** Presentatiegrens: nl-NL-weergave, bv. 3025 → '€30,25'. */
export function formatCentsForDisplay(cents: number): string {
  return `€${formatCentsForMollie(cents).replace('.', ',')}`;
}

/**
 * Databasegrens voor `instructor_licenses.price_per_month`: de NETTO
 * maandprijs (excl. btw) als numeriek euro-bedrag. Alleen op deze grens
 * mag een decimaal prijsgetal richting opslag ontstaan.
 */
export function netMonthlyEurosForDb(pricing: PlanPricing): number {
  return pricing.netMonthlyCents / 100;
}

// ── Factuurperiode: maandelijks of jaarlijks ────────────────────────────────
//
// BESLUIT J1 (Önder, okt 2026): de jaarprijs is exact 12× de maandprijs,
// zonder korting. Daarom staat hier GEEN tweede bedragentabel: de jaarbedragen
// worden afgeleid van NET_MONTHLY_CENTS. Een losse jaarconstante zou een
// tweede waarheid zijn die bij de eerstvolgende prijswijziging uit de pas
// loopt.
//
// De draadwaarde is overal `'maand' | 'jaar'`. Ontbreekt hij, dan is het
// `'maand'` — zo blijven oude clients en verzoeken werken zoals vóór de
// jaarvariant.

export const BILLING_INTERVALS = ['maand', 'jaar'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const DEFAULT_BILLING_INTERVAL: BillingInterval = 'maand';

const MAANDEN_PER_INTERVAL: Record<BillingInterval, number> = {
  maand: 1,
  jaar: 12,
};

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === 'string' && (BILLING_INTERVALS as readonly string[]).includes(value);
}

/**
 * Servergrens voor `interval` uit een verzoek. Afwezig (undefined, null of
 * lege string) → `'maand'`. Iets anders dan exact `maand` of `jaar` → null,
 * zodat de aanroeper het verzoek kan weigeren in plaats van te raden.
 */
export function parseBillingInterval(value: unknown): BillingInterval | null {
  if (value === undefined || value === null || value === '') return DEFAULT_BILLING_INTERVAL;
  return isBillingInterval(value) ? value : null;
}

/** Stripe's `recurring.interval` dat bij een Ribba-interval hoort. */
export function stripeIntervalFor(interval: BillingInterval): 'month' | 'year' {
  return interval === 'jaar' ? 'year' : 'month';
}

/** Stripe's `recurring.interval` terugvertaald; onbekend → null. */
export function billingIntervalFromStripe(value: unknown): BillingInterval | null {
  if (value === 'month') return 'maand';
  if (value === 'year') return 'jaar';
  return null;
}

/**
 * Interval van een Stripe-prijs (`price.recurring`). Alleen elke maand of elk
 * jaar telt; een prijs die per meerdere perioden factureert (interval_count ≠ 1)
 * of ontbrekende gegevens → null (onbekend).
 */
export function intervalVanStripePrijs(
  recurring: { interval?: string | null; interval_count?: number | null } | null | undefined,
): BillingInterval | null {
  if (!recurring) return null;
  if ((recurring.interval_count ?? 1) !== 1) return null;
  return billingIntervalFromStripe(recurring.interval);
}

export interface PlanIntervalPricing {
  plan: PaidPlan;
  interval: BillingInterval;
  /** Prijs per periode excl. btw, in centen (jaar = 12× maand). */
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatRatePercent: typeof VAT_RATE_PERCENT;
}

/**
 * Bedragen per factuurperiode. Afgeleid van de maandprijs (J1: 12×, geen
 * korting); fail-closed bij een onbekend plan of interval.
 */
export function getPlanIntervalPricing(plan: unknown, interval: unknown): PlanIntervalPricing {
  const maand = getPlanPricing(plan);
  if (!isBillingInterval(interval)) {
    throw new Error(`Onbekende factuurperiode: ${String(interval)}`);
  }
  const netCents = maand.netMonthlyCents * MAANDEN_PER_INTERVAL[interval];
  const vatCents = Math.round((netCents * VAT_RATE_PERCENT) / 100);
  return {
    plan: maand.plan,
    interval,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
    vatRatePercent: VAT_RATE_PERCENT,
  };
}

/** "per maand" / "per jaar". */
export function perIntervalTekst(interval: BillingInterval): string {
  return interval === 'jaar' ? 'per jaar' : 'per maand';
}

/** "maand" / "jaar" — voor "€ 45,00 / maand". */
export function intervalEenheid(interval: BillingInterval): string {
  return interval === 'jaar' ? 'jaar' : 'maand';
}

// ── J5: website-service bij Premium jaarlijks ──────────────────────────────
//
// BESLUIT J5 (Önder, okt 2026): uitsluitend Premium, uitsluitend bij jaarlijks
// betalen, omvat de website-service — Ribba verzorgt de eigen website van de
// rijschool. Nooit bij Basic. Bij Premium maandelijks staat hij er wél, met
// "(bij een jaarabonnement)" erachter, zodat je ziet wat jaarlijks oplevert
// (besluit Önder 24 okt).
//
// Eén plek voor de tekst. Pagina's vragen hier wat er extra bij een plan
// hoort, in plaats van de zin zelf te typen.

/** De bullet zoals hij staat waar "Jaarlijks" gekozen is. */
export const WEBSITE_SERVICE_TEKST =
  'Een professionele website voor je rijschool, door ons gebouwd en onderhouden';

/** Dezelfde bullet bij maandelijks of op een pagina zonder maand/jaar-keuze. */
export const WEBSITE_SERVICE_TEKST_STATISCH =
  `${WEBSITE_SERVICE_TEKST} (bij een jaarabonnement)`;

/**
 * Wat er bovenop de vaste features van een plan bij komt.
 *
 * - Premium + jaar: de bullet zoals hij is.
 * - Premium + maand, of een pagina zonder keuze ('statisch'): de bullet met
 *   "(bij een jaarabonnement)", zodat hij nooit als onderdeel van maandelijks
 *   leest maar wél laat zien wat jaarlijks oplevert.
 * - Basic krijgt nooit iets.
 */
export function planExtraFeatures(
  plan: PaidPlan,
  interval: BillingInterval | 'statisch',
): string[] {
  if (plan !== 'premium') return [];
  return interval === 'jaar' ? [WEBSITE_SERVICE_TEKST] : [WEBSITE_SERVICE_TEKST_STATISCH];
}

/** Vaste Mollie-omschrijving per plan (checkout, webhook én reconcile). */
export function planDescription(plan: PaidPlan): string {
  return `Ribba ${plan === 'premium' ? 'Premium' : 'Basic'} – Maandabonnement`;
}
