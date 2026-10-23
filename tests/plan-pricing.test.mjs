// P0.1 — unit-tests voor lib/plan-pricing.ts, de centrale prijs-SSoT.
// Bindend besluit (Önder, 12 jul 2026): prijzen zijn EXCL. 21% btw;
// Mollie incasseert bruto; price_per_month = netto; onbekend plan =
// fail-closed (UnknownPlanError), nooit een fallback-bedrag.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  VAT_RATE_PERCENT,
  isPaidPlan,
  getPlanPricing,
  formatCentsForMollie,
  formatCentsForDisplay,
  netMonthlyEurosForDb,
  planDescription,
  UnknownPlanError,
} = await import('../lib/plan-pricing.ts');

test('P1: Basic — €25,00 excl. → €5,25 btw → €30,25 bruto, alles in integer centen', () => {
  const p = getPlanPricing('basic');
  assert.equal(p.plan, 'basic');
  assert.equal(p.netMonthlyCents, 2500);
  assert.equal(p.vatCents, 525);
  assert.equal(p.grossMonthlyCents, 3025);
  assert.equal(p.vatRatePercent, 21);
  assert.ok(Number.isInteger(p.netMonthlyCents) && Number.isInteger(p.vatCents) && Number.isInteger(p.grossMonthlyCents));
});

test('P2: Premium — €45,00 excl. → €9,45 btw → €54,45 bruto', () => {
  const p = getPlanPricing('premium');
  assert.equal(p.netMonthlyCents, 4500);
  assert.equal(p.vatCents, 945);
  assert.equal(p.grossMonthlyCents, 5445);
});

test('P3: Mollie-grens — exact decimaalformaat met punt', () => {
  assert.equal(formatCentsForMollie(getPlanPricing('basic').grossMonthlyCents), '30.25');
  assert.equal(formatCentsForMollie(getPlanPricing('premium').grossMonthlyCents), '54.45');
  assert.equal(formatCentsForMollie(0), '0.00');
  assert.equal(formatCentsForMollie(5), '0.05');
});

test('P4: Mollie-formatter weigert niet-integere of negatieve centen', () => {
  assert.throws(() => formatCentsForMollie(30.25));
  assert.throws(() => formatCentsForMollie(-1));
  assert.throws(() => formatCentsForMollie(NaN));
});

test('P5: onbekend plan → UnknownPlanError, geen enkel fallback-bedrag', () => {
  for (const bad of ['trial', 'expired', 'legacy_gold', '', null, undefined, 45, {}]) {
    assert.throws(() => getPlanPricing(bad), UnknownPlanError);
  }
  assert.equal(isPaidPlan('basic'), true);
  assert.equal(isPaidPlan('premium'), true);
  assert.equal(isPaidPlan('trial'), false);
  assert.equal(isPaidPlan(undefined), false);
});

test('P6: databasegrens — price_per_month is de NETTO maandprijs', () => {
  assert.equal(netMonthlyEurosForDb(getPlanPricing('basic')), 25);
  assert.equal(netMonthlyEurosForDb(getPlanPricing('premium')), 45);
});

test('P7: presentatiegrens — nl-NL weergave', () => {
  assert.equal(formatCentsForDisplay(3025), '€30,25');
  assert.equal(formatCentsForDisplay(5445), '€54,45');
  assert.equal(formatCentsForDisplay(2500), '€25,00');
});

test('P8: btw-tarief is exact 21% en de som klopt per constructie', () => {
  assert.equal(VAT_RATE_PERCENT, 21);
  for (const plan of ['basic', 'premium']) {
    const p = getPlanPricing(plan);
    assert.equal(p.netMonthlyCents + p.vatCents, p.grossMonthlyCents);
    assert.equal(p.vatCents, Math.round((p.netMonthlyCents * 21) / 100));
  }
});

test('P9: vaste Mollie-omschrijvingen (checkout, webhook én reconcile delen deze)', () => {
  assert.equal(planDescription('basic'), 'Ribba Basic – Maandabonnement');
  assert.equal(planDescription('premium'), 'Ribba Premium – Maandabonnement');
});

// ── Jaarabonnement (J1) en website-service (J5) ─────────────────────────────

const {
  getPlanIntervalPricing,
  parseBillingInterval,
  perIntervalTekst,
  intervalEenheid,
  stripeIntervalFor,
  billingIntervalFromStripe,
  planExtraFeatures,
  WEBSITE_SERVICE_TEKST,
  WEBSITE_SERVICE_TEKST_STATISCH,
} = await import('../lib/plan-pricing.ts');

test('J1: jaarprijs = 12× maandprijs, geen korting — Basic €300, Premium €540 excl. btw', () => {
  const b = getPlanIntervalPricing('basic', 'jaar');
  assert.equal(b.netCents, 30000);
  assert.equal(b.vatCents, 6300);
  assert.equal(b.grossCents, 36300);
  const p = getPlanIntervalPricing('premium', 'jaar');
  assert.equal(p.netCents, 54000);
  assert.equal(p.vatCents, 11340);
  assert.equal(p.grossCents, 65340);
  for (const plan of ['basic', 'premium']) {
    assert.equal(getPlanIntervalPricing(plan, 'jaar').netCents, getPlanPricing(plan).netMonthlyCents * 12);
    // Maand via de nieuwe helper = de bestaande maandprijs.
    assert.equal(getPlanIntervalPricing(plan, 'maand').grossCents, getPlanPricing(plan).grossMonthlyCents);
  }
});

test('J1: fail-closed bij onbekend plan of onbekende periode', () => {
  assert.throws(() => getPlanIntervalPricing('gold', 'jaar'), UnknownPlanError);
  assert.throws(() => getPlanIntervalPricing('basic', 'kwartaal'));
});

test('interval-grens: afwezig → maand; maand/jaar exact; de rest → null', () => {
  for (const leeg of [undefined, null, '']) assert.equal(parseBillingInterval(leeg), 'maand');
  assert.equal(parseBillingInterval('maand'), 'maand');
  assert.equal(parseBillingInterval('jaar'), 'jaar');
  for (const fout of ['Jaar', 'year', 'month', 'kwartaal', 12, {}]) assert.equal(parseBillingInterval(fout), null);
});

test('interval-teksten en Stripe-vertaling', () => {
  assert.equal(perIntervalTekst('jaar'), 'per jaar');
  assert.equal(perIntervalTekst('maand'), 'per maand');
  assert.equal(intervalEenheid('jaar'), 'jaar');
  assert.equal(stripeIntervalFor('jaar'), 'year');
  assert.equal(stripeIntervalFor('maand'), 'month');
  assert.equal(billingIntervalFromStripe('year'), 'jaar');
  assert.equal(billingIntervalFromStripe('month'), 'maand');
  assert.equal(billingIntervalFromStripe('week'), null);
});

test('J5: Basic krijgt de website-service nooit, in geen enkele weergave', () => {
  for (const i of ['maand', 'jaar', 'statisch']) assert.deepEqual(planExtraFeatures('basic', i), []);
});

test('J5: Premium alleen bij jaarlijks; statisch altijd met het voorvoegsel "Bij jaarlijks betalen:"', () => {
  assert.deepEqual(planExtraFeatures('premium', 'maand'), []);
  assert.deepEqual(planExtraFeatures('premium', 'jaar'), [WEBSITE_SERVICE_TEKST]);
  assert.deepEqual(planExtraFeatures('premium', 'statisch'), [WEBSITE_SERVICE_TEKST_STATISCH]);
  assert.match(WEBSITE_SERVICE_TEKST_STATISCH, /^Bij jaarlijks betalen: /);
  assert.match(WEBSITE_SERVICE_TEKST, /eigen website/);
});

test('J5: de pagina\'s gebruiken de gedeelde bron, geen eigen zin', async () => {
  const { readFileSync } = await import('node:fs');
  const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');
  const pro = lees('../app/(site)/pro/page.tsx');
  const upgrade = lees('../app/(site)/upgrade/page.tsx');
  const form = lees('../components/SchoolRegistrationForm.tsx');
  assert.match(pro, /planExtraFeatures\('premium', 'statisch'\)/);
  assert.match(upgrade, /planExtraFeatures\('premium', getoondePeriode\)/);
  assert.match(form, /planExtraFeatures\('premium', aanbod\.interval\)/);
  for (const src of [pro, upgrade, form]) {
    assert.doesNotMatch(src, /verzorgen je eigen website/, 'zin hoort alleen in plan-pricing');
  }
});
