// Planwissel meten met Test Clocks — testmodus, wegwerpobjecten.
//
// Ontwerp: ribbaPro docs/design/planwissel-ontwerp-2026-10-01.md (PR #731).
//
// De productregels staan vast (Önder, 1 okt 2026): een downgrade gaat in aan
// het einde van de periode, een upgrade direct met het verschil bij de
// volgende incasso. Stripe kent voor "aan het einde van de periode" één
// mechanisme: een Subscription Schedule. Dit script meet wat dat mechanisme
// werkelijk doet, vóórdat er productiecode komt.
//
//   B1  blijft trial_end exact gelijk als fase 1 wordt herhaald?
//   B2  blijft een 100%-coupon staan in fase 1 én fase 2?
//   B3  wat doet cancel_at op een abonnement met een schedule eraan?
//   B4  welke events komen er bij de fasewissel, in welke volgorde?
//   B5  wat is de factuur op het wisselmoment — alleen Basic, zonder verrekening?
//   B6  laat `release` het abonnement exact achter zoals het was?
//   U   upgrade midden in een betaalde periode: verschil bij de volgende
//       incasso (create_prorations) versus aparte incasso nu (always_invoice)
//
// Waarom dit niet uit de documentatie kan: de API-versie is gepind op
// 2026-06-24.dahlia, en juist rond schedules en trials is daarna gedrag
// gewijzigd (changelog 2026-07-29). Wat op ónze versie gebeurt, blijkt alleen
// uit gedrag.
//
// Niet in CI. Handmatig, met een TESTsleutel, en ruimt zichzelf op:
//
//   STRIPE_TEST=sk_test_… node scripts/bewijs-planwissel.mjs            # alles
//   STRIPE_TEST=sk_test_… node scripts/bewijs-planwissel.mjs B1 B3      # een deel
//   node scripts/bewijs-planwissel.mjs --plan                           # alleen tonen
//
// Het script weigert elke sleutel die geen testsleutel is, en controleert na de
// eerste aanroep dat Stripe zelf `livemode: false` teruggeeft.

import Stripe from 'stripe';

const PREFIX = '[PLANWISSEL-BEWIJS]';
const API_VERSION = '2026-06-24.dahlia';
/** Stripe's gepubliceerde test-IBAN die slaagt. Geen echte rekening. */
const IBAN_SLAAGT = 'NL39RABO0300065264';

const SCENARIOS = {
  B1: 'downgrade in de gratis periode: trial_end, events, factuur (B1, B4, B5)',
  B2: 'downgrade met een 100%-coupon (B2)',
  B3: 'opzeggen terwijl er een schedule aan hangt (B3)',
  B5: 'downgrade in een betaalde periode + opzeggen in de periode erna (B5, B3)',
  B6: 'geplande wissel intrekken met release (B6)',
  U: 'upgrade midden in een betaalde periode: twee vormen (U)',
  P: 'controle van de meetopzet: rondt een SEPA-incasso af op een Test Clock?',
};

const args = process.argv.slice(2);
const alleenPlan = args.includes('--plan');
const gevraagd = args.filter((a) => !a.startsWith('--'));
const teDraaien = gevraagd.length ? gevraagd : Object.keys(SCENARIOS);

for (const naam of teDraaien) {
  if (!SCENARIOS[naam]) {
    console.error(`Onbekend scenario "${naam}". Kies uit: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
  }
}

if (alleenPlan) {
  console.log('Dit script zou draaien, elk scenario op een eigen Test Clock:\n');
  for (const naam of teDraaien) console.log(`  ${naam.padEnd(3)} ${SCENARIOS[naam]}`);
  console.log('\nGeen Stripe-aanroep gedaan.');
  process.exit(0);
}

// ── De poort: alleen een testsleutel ────────────────────────────────────────
const KEY = process.env.STRIPE_TEST ?? '';
if (!/^(sk|rk)_test_/.test(KEY)) {
  console.error('GEWEIGERD: STRIPE_TEST ontbreekt of is geen testsleutel (verwacht sk_test_… of rk_test_…).');
  console.error('Dit script maakt klanten, abonnementen en facturen aan. Dat mag nooit in live.');
  process.exit(1);
}
const stripe = new Stripe(KEY, { apiVersion: API_VERSION });

// ── Hulpjes ─────────────────────────────────────────────────────────────────
const tijd = (u) => (u ? new Date(u * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—');
const euro = (centen) => `€${(centen / 100).toFixed(2)}`;
/**
 * Het bedrag zonder btw. De controles vergelijken hierop: de testomgeving heeft
 * geen btw-registratie en rekent 0%, live rekent 21%. Het plan en de
 * verrekening zijn wat dit onderzoek meet, niet het btw-tarief.
 */
const netto = (f) => f.total_excluding_tax ?? f.subtotal;
const UUR = 3600;
const DAG = 86400;

/** Eén kalendermaand verder, zoals de echte inschrijving de gratis periode zet. */
function plusMaand(unix, n = 1) {
  const d = new Date(unix * 1000);
  d.setUTCMonth(d.getUTCMonth() + n);
  return Math.floor(d.getTime() / 1000);
}

const opruimen = { klokken: [], prijzen: [], producten: [], coupons: [] };
const bevindingen = [];
const bevinding = (vraag, uitkomst, detail = '') => {
  bevindingen.push({ vraag, uitkomst, detail });
  console.log(`\n  ▶ ${vraag}: ${uitkomst}${detail ? `\n    ${detail}` : ''}`);
};

async function klokNaar(clockId, unix, label) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: unix });
  for (let i = 0; i < 90; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === 'ready') return;
    if (c.status === 'internal_failure') throw new Error(`klok faalde bij ${label}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`klok bleef hangen bij ${label}`);
}

/** Het deel van een subscription waar dit onderzoek naar kijkt. */
function foto(sub) {
  const item = sub.items.data[0];
  return {
    status: sub.status,
    plan: item?.price?.metadata?.plan ?? null,
    price: item?.price?.id ?? null,
    quantity: item?.quantity ?? null,
    trial_end: sub.trial_end ?? null,
    cancel_at: sub.cancel_at ?? null,
    billing_cycle_anchor: sub.billing_cycle_anchor ?? null,
    current_period_end: item?.current_period_end ?? null,
    discounts: (sub.discounts ?? []).map((d) => (typeof d === 'string' ? d : d.id)),
    schedule: typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null,
    default_payment_method:
      typeof sub.default_payment_method === 'string' ? sub.default_payment_method : sub.default_payment_method?.id ?? null,
  };
}

/** Wat verschilt er tussen twee foto's? Lege lijst = identiek. */
function verschil(a, b, negeer = []) {
  return Object.keys(a)
    .filter((k) => !negeer.includes(k))
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
}

function toonFoto(label, f) {
  console.log(
    `  ${label.padEnd(22)} status=${f.status} plan=${f.plan} trial_end=${tijd(f.trial_end)} ` +
      `cancel_at=${tijd(f.cancel_at)} kortingen=${f.discounts.length} schedule=${f.schedule ?? '—'}`,
  );
}

async function laatsteFactuur(subId) {
  const lijst = await stripe.invoices.list({ subscription: subId, limit: 10 });
  return lijst.data;
}

function toonFactuur(f) {
  console.log(`    factuur ${f.number ?? f.id}  ${f.billing_reason}  status=${f.status}  totaal=${euro(f.total)}  (excl. ${euro(f.total_excluding_tax ?? f.subtotal)})`);
  for (const r of f.lines.data) {
    console.log(`      regel ${euro(r.amount).padStart(9)}  ${r.description}`);
  }
}

async function toonEvents(vanafUnix, ...ids) {
  const events = await stripe.events.list({ limit: 100, created: { gte: vanafUnix } });
  const relevant = events.data
    .filter((e) => {
      const tekst = JSON.stringify(e.data?.object ?? {});
      return ids.some((id) => id && tekst.includes(id));
    })
    .reverse();
  for (const e of relevant) {
    const o = e.data.object;
    let extra = '';
    if (e.type.startsWith('customer.subscription')) {
      extra = `status=${o.status} plan=${o.items?.data?.[0]?.price?.metadata?.plan} schedule=${o.schedule ?? '—'} cancel_at=${tijd(o.cancel_at)}`;
    } else if (e.type.startsWith('invoice.')) {
      extra = `${o.billing_reason} ${o.status} ${euro(o.total ?? 0)}`;
    } else if (e.type.startsWith('subscription_schedule')) {
      extra = `status=${o.status} fasen=${o.phases?.length}`;
    }
    console.log(`    ${e.type.padEnd(40)} ${extra}`);
  }
  return relevant.map((e) => e.type);
}

/** Herhaalt een bestaande fase exact, zoals Stripe het bij een update eist. */
function herhaalFase(fase) {
  const uit = {
    items: fase.items.map((i) => ({
      price: typeof i.price === 'string' ? i.price : i.price.id,
      quantity: i.quantity ?? 1,
    })),
    start_date: fase.start_date,
    end_date: fase.end_date,
  };
  // Alleen trial_end, nooit `trial: true` erbij: op onze API-versie sluiten die
  // elkaar uit (pas vanaf 2026-07-29 mag het samen).
  if (fase.trial_end) uit.trial_end = fase.trial_end;
  if (fase.discounts?.length) {
    uit.discounts = fase.discounts.map((d) => (d.discount ? { discount: d.discount } : { coupon: d.coupon }));
  }
  return uit;
}

// ── Gedeelde opzet ──────────────────────────────────────────────────────────
let prijzen;
let belasting = true;

async function maakPrijzen() {
  const maak = async (naam, centen, plan) => {
    const product = await stripe.products.create({ name: `${PREFIX} ${naam}` });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: centen,
      currency: 'eur',
      recurring: { interval: 'month' },
      tax_behavior: 'exclusive',
      metadata: { plan, trial_interval: '1 month' },
    });
    opruimen.producten.push(product.id);
    opruimen.prijzen.push(price.id);
    return price.id;
  };
  // Twee verschillende producten, net als in live.
  return { basic: await maak('Ribba Basic', 2500, 'basic'), premium: await maak('Ribba Premium', 4500, 'premium') };
}

/** Klant met een geldig SEPA-mandaat, op een eigen klok. */
async function maakKlant(label, t0) {
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: t0, name: `${PREFIX} ${label}` });
  if (clock.livemode !== false) {
    throw new Error('Stripe gaf geen livemode:false terug voor de testklok — afgebroken.');
  }
  opruimen.klokken.push(clock.id);
  const klant = await stripe.customers.create({
    name: `${PREFIX} ${label}`,
    email: 'planwissel-bewijs@ribba.test',
    address: { country: 'NL', line1: 'Teststraat 1', postal_code: '3011AA', city: 'Rotterdam' },
    test_clock: clock.id,
  });
  const pm = await stripe.paymentMethods.create({
    type: 'sepa_debit',
    sepa_debit: { iban: IBAN_SLAAGT },
    billing_details: { name: 'Rijschool Planwissel', email: 'planwissel-bewijs@ribba.test' },
  });
  // Het mandaat: zonder kan Stripe niet off-session incasseren.
  await stripe.setupIntents.create({
    customer: klant.id,
    payment_method: pm.id,
    payment_method_types: ['sepa_debit'],
    confirm: true,
    mandate_data: { customer_acceptance: { type: 'offline' } },
  });
  return { clock, klant, pm };
}

async function maakAbonnement({ klant, pm }, plan, extra = {}) {
  const basis = { customer: klant.id, items: [{ price: prijzen[plan] }], default_payment_method: pm.id, ...extra };
  if (!belasting) return stripe.subscriptions.create(basis);
  try {
    return await stripe.subscriptions.create({ ...basis, automatic_tax: { enabled: true } });
  } catch (e) {
    if (!/tax/i.test(String(e.message))) throw e;
    belasting = false;
    console.log(`  (automatische btw werkt niet in deze testomgeving: ${String(e.message).slice(0, 110)} — verder zonder btw)`);
    return stripe.subscriptions.create(basis);
  }
}

/** Plant de wissel naar Basic aan het einde van de lopende fase. */
async function planDowngrade(subId) {
  const schedule = await stripe.subscriptionSchedules.create({ from_subscription: subId });
  const fase0 = schedule.phases[0];
  console.log(
    `  schedule ${schedule.id} uit het abonnement: 1 fase ${tijd(fase0.start_date)} → ${tijd(fase0.end_date)}` +
      `  trial_end=${tijd(fase0.trial_end)}  kortingen=${fase0.discounts?.length ?? 0}`,
  );
  const fase1 = herhaalFase(fase0);
  const fase2Basis = { items: [{ price: prijzen.basic, quantity: 1 }], proration_behavior: 'none' };
  if (fase1.discounts) fase2Basis.discounts = fase1.discounts;

  let bijgewerkt;
  let lengteVorm;
  try {
    bijgewerkt = await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [fase1, { ...fase2Basis, duration: { interval: 'month', interval_count: 1 } }],
    });
    lengteVorm = 'duration';
  } catch (e) {
    console.log(`  (fase 2 met \`duration\` geweigerd: ${String(e.message).slice(0, 140)})`);
    try {
      bijgewerkt = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [fase1, { ...fase2Basis, iterations: 1 }],
      });
      lengteVorm = 'iterations';
    } catch (e2) {
      // Niets half laten hangen: het abonnement moet weer vrij zijn.
      await stripe.subscriptionSchedules.release(schedule.id);
      throw new Error(`schedule bijwerken mislukt, schedule losgelaten: ${e2.message}`);
    }
  }
  return { schedule: bijgewerkt, fase0, lengteVorm };
}

// ── Scenario's ──────────────────────────────────────────────────────────────

async function scenarioB1() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('B1 gratis periode', t0);
  const trialEind = plusMaand(t0);
  const sub = await maakAbonnement(omgeving, 'premium', { trial_end: trialEind });
  const voor = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('vóór', voor);

  const { schedule, lengteVorm } = await planDowngrade(sub.id);
  const na = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná plannen', na);

  const delta = verschil(voor, na, ['schedule']);
  bevinding(
    'B1 trial_end blijft gelijk bij het herhalen van fase 1',
    delta.length === 0 ? 'JA — abonnement ongewijzigd behalve de schedule-koppeling' : 'NEE',
    delta.join(' | ') || `fase 2 opgegeven met \`${lengteVorm}\``,
  );

  await klokNaar(omgeving.clock.id, trialEind + UUR, 'einde gratis periode');
  const naWissel = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná de wissel', naWissel);
  const facturen = await laatsteFactuur(sub.id);
  const wisselFactuur = facturen[0];
  console.log('  facturen (nieuwste eerst):');
  facturen.forEach(toonFactuur);
  bevinding(
    'B5 factuur op het wisselmoment (gratis periode)',
    naWissel.plan === 'basic' && wisselFactuur && netto(wisselFactuur) === 2500 && wisselFactuur.lines.data.length === 1
      ? `JA — één regel, ${euro(netto(wisselFactuur))} excl. btw, plan=basic`
      : 'AFWIJKEND',
    `plan=${naWissel.plan} status=${naWissel.status} totaal=${wisselFactuur ? euro(wisselFactuur.total) : '—'} regels=${wisselFactuur?.lines.data.length}`,
  );

  console.log('  events (oudste eerst):');
  const types = await toonEvents(t0 - 60, sub.id, schedule.id);
  bevinding('B4 events bij de fasewissel', `${types.length} events`, [...new Set(types)].join(', '));

  const scheduleNa = await stripe.subscriptionSchedules.retrieve(schedule.id);
  console.log(`  schedule ná de wissel: status=${scheduleNa.status} huidige fase tot ${tijd(scheduleNa.current_phase?.end_date)}`);
  await klokNaar(omgeving.clock.id, scheduleNa.current_phase.end_date + UUR, 'einde fase 2');
  const eind = foto(await stripe.subscriptions.retrieve(sub.id));
  const scheduleEind = await stripe.subscriptionSchedules.retrieve(schedule.id);
  toonFoto('ná fase 2', eind);
  bevinding(
    'B1 ná fase 2 laat Stripe het abonnement los',
    eind.schedule === null && eind.plan === 'basic' ? 'JA — geen schedule meer, plan blijft basic' : 'AFWIJKEND',
    `schedule.status=${scheduleEind.status} abonnement.schedule=${eind.schedule} plan=${eind.plan} status=${eind.status}`,
  );
}

async function scenarioB2() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('B2 coupon', t0);
  const coupon = await stripe.coupons.create({
    name: `${PREFIX} 6 maanden gratis`, percent_off: 100, duration: 'repeating', duration_in_months: 6,
  });
  opruimen.coupons.push(coupon.id);
  const sub = await maakAbonnement(omgeving, 'premium', { discounts: [{ coupon: coupon.id }] });
  const voor = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('vóór', voor);
  // De korting zelf: loopt hij nog tot dezelfde datum, of start het herhalen
  // van de coupon in de fasen een nieuwe looptijd?
  const korting = async () => {
    const s = await stripe.subscriptions.retrieve(sub.id, { expand: ['discounts'] });
    const d = s.discounts[0];
    return d && typeof d !== 'string' ? { id: d.id, start: d.start, end: d.end } : null;
  };
  const kortingVoor = await korting();
  console.log(`  korting vóór:        ${kortingVoor?.id}  ${tijd(kortingVoor?.start)} → ${tijd(kortingVoor?.end)}`);

  const { fase0 } = await planDowngrade(sub.id);
  const na = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná plannen', na);
  console.log(`  korting in de fase die Stripe zelf maakte: ${JSON.stringify(fase0.discounts ?? [])}`);
  const kortingNaPlannen = await korting();
  console.log(`  korting ná plannen:  ${kortingNaPlannen?.id}  ${tijd(kortingNaPlannen?.start)} → ${tijd(kortingNaPlannen?.end)}`);

  await klokNaar(omgeving.clock.id, voor.current_period_end + UUR, 'einde periode 1');
  const naWissel = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná de wissel', naWissel);
  const facturen = await laatsteFactuur(sub.id);
  console.log('  facturen (nieuwste eerst):');
  facturen.forEach(toonFactuur);
  bevinding(
    'B2 de 100%-coupon overleeft de wissel',
    naWissel.plan === 'basic' && naWissel.discounts.length === 1 && facturen[0]?.total === 0
      ? 'JA — plan=basic, korting staat er nog, factuur €0,00'
      : 'NEE / AFWIJKEND',
    `plan=${naWissel.plan} kortingen=${naWissel.discounts.length} factuur=${facturen[0] ? euro(facturen[0].total) : '—'}`,
  );
  const kortingNaWissel = await korting();
  console.log(`  korting ná de wissel: ${kortingNaWissel?.id}  ${tijd(kortingNaWissel?.start)} → ${tijd(kortingNaWissel?.end)}`);
  const zelfdeEind = kortingVoor?.end === kortingNaPlannen?.end && kortingVoor?.end === kortingNaWissel?.end;
  bevinding(
    'B2 de korting houdt zijn oorspronkelijke einddatum',
    zelfdeEind ? `JA — eindigt nog steeds op ${tijd(kortingVoor?.end)}` : 'NEE — de looptijd is verschoven',
    `vóór ${tijd(kortingVoor?.end)} · ná plannen ${tijd(kortingNaPlannen?.end)} · ná de wissel ${tijd(kortingNaWissel?.end)}` +
      ` · zelfde korting-id: ${kortingVoor?.id === kortingNaWissel?.id ? 'ja' : `nee (${kortingVoor?.id} → ${kortingNaWissel?.id})`}`,
  );
}

async function scenarioB3() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('B3 opzeggen met schedule', t0);
  const trialEind = plusMaand(t0);
  const sub = await maakAbonnement(omgeving, 'premium', { trial_end: trialEind });
  const { schedule } = await planDowngrade(sub.id);
  toonFoto('ná plannen', foto(await stripe.subscriptions.retrieve(sub.id)));

  // Precies wat stripe-cancel-subscription doet.
  let opgezegd = null;
  try {
    opgezegd = await stripe.subscriptions.update(sub.id, { cancel_at: 'min_period_end' });
    const f = foto(opgezegd);
    toonFoto('ná cancel_at', f);
    const s = await stripe.subscriptionSchedules.retrieve(schedule.id);
    bevinding(
      'B3 cancel_at op een abonnement met schedule',
      'GEACCEPTEERD',
      `cancel_at=${tijd(f.cancel_at)} schedule op abonnement=${f.schedule ?? '—'} schedule.status=${s.status} end_behavior=${s.end_behavior} fasen=${s.phases.length}`,
    );
  } catch (e) {
    bevinding('B3 cancel_at op een abonnement met schedule', 'GEWEIGERD door Stripe', String(e.message).slice(0, 220));
  }

  if (opgezegd) {
    await klokNaar(omgeving.clock.id, trialEind + UUR, 'einde gratis periode');
    const eind = await stripe.subscriptions.retrieve(sub.id);
    bevinding(
      'B3 wat wint op de einddatum: de opzegging of de wissel?',
      eind.status === 'canceled' ? 'DE OPZEGGING — abonnement is beëindigd' : 'DE WISSEL — abonnement loopt door',
      `status=${eind.status} plan=${eind.items.data[0]?.price?.metadata?.plan} ended_at=${tijd(eind.ended_at)}`,
    );
    return;
  }

  // Geweigerd: dan de route uit het ontwerp — eerst loslaten, dan opzeggen.
  await stripe.subscriptionSchedules.release(schedule.id);
  const naRelease = await stripe.subscriptions.update(sub.id, { cancel_at: 'min_period_end' });
  toonFoto('release + cancel_at', foto(naRelease));
  await klokNaar(omgeving.clock.id, trialEind + UUR, 'einde gratis periode');
  const eind = await stripe.subscriptions.retrieve(sub.id);
  bevinding(
    'B3 eerst loslaten, dan opzeggen',
    eind.status === 'canceled' ? 'WERKT — abonnement beëindigd op de einddatum' : 'AFWIJKEND',
    `status=${eind.status} ended_at=${tijd(eind.ended_at)}`,
  );
}

async function scenarioB5() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('B5 betaalde periode', t0);
  const sub = await maakAbonnement(omgeving, 'premium');
  // Laat de eerste incasso landen: SEPA is pas na dagen definitief.
  await klokNaar(omgeving.clock.id, t0 + 10 * DAG, 'dag 10');
  const voor = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('dag 10, vóór', voor);

  const { schedule } = await planDowngrade(sub.id);
  const na = foto(await stripe.subscriptions.retrieve(sub.id));
  const delta = verschil(voor, na, ['schedule']);
  bevinding(
    'B5 plannen in een betaalde periode verandert het abonnement niet',
    delta.length === 0 ? 'JA — Premium blijft tot het periode-einde' : 'NEE',
    delta.join(' | '),
  );
  const facturenVoor = (await laatsteFactuur(sub.id)).length;

  await klokNaar(omgeving.clock.id, voor.current_period_end + UUR, 'einde periode 1');
  const naWissel = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná de wissel', naWissel);
  const facturen = await laatsteFactuur(sub.id);
  console.log('  facturen (nieuwste eerst):');
  facturen.forEach(toonFactuur);
  const nieuw = facturen[0];
  bevinding(
    'B5 factuur op het wisselmoment (betaalde periode)',
    naWissel.plan === 'basic' && netto(nieuw) === 2500 && nieuw.lines.data.length === 1 && facturen.length === facturenVoor + 1
      ? `JA — één nieuwe factuur, één regel, ${euro(netto(nieuw))} excl. btw, geen verrekening`
      : 'AFWIJKEND',
    `plan=${naWissel.plan} totaal=${euro(nieuw.total)} regels=${nieuw.lines.data.length} facturen ${facturenVoor}→${facturen.length}`,
  );

  // De schedule hangt er nu nog één periode aan. Kan de rijschool dan opzeggen?
  try {
    const opgezegd = await stripe.subscriptions.update(sub.id, { cancel_at: 'min_period_end' });
    const f = foto(opgezegd);
    bevinding(
      'B3 opzeggen in de periode ná de wissel (schedule hangt er nog aan)',
      'GEACCEPTEERD',
      `cancel_at=${tijd(f.cancel_at)} schedule op abonnement=${f.schedule ?? '—'}`,
    );
    await klokNaar(omgeving.clock.id, naWissel.current_period_end + UUR, 'einde periode 2');
    const eind = await stripe.subscriptions.retrieve(sub.id);
    bevinding(
      'B3 houdt die opzegging stand tot de einddatum?',
      eind.status === 'canceled' ? 'JA — abonnement beëindigd' : 'NEE — abonnement loopt door',
      `status=${eind.status} cancel_at=${tijd(eind.cancel_at)} schedule=${foto(eind).schedule ?? '—'}`,
    );
  } catch (e) {
    bevinding('B3 opzeggen in de periode ná de wissel (schedule hangt er nog aan)', 'GEWEIGERD door Stripe', String(e.message).slice(0, 220));
    const s = await stripe.subscriptionSchedules.retrieve(schedule.id);
    console.log(`  schedule.status=${s.status}`);
  }
}

async function scenarioB6() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('B6 intrekken', t0);
  const trialEind = plusMaand(t0);
  const sub = await maakAbonnement(omgeving, 'premium', { trial_end: trialEind });
  const voor = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('vóór', voor);
  const { schedule } = await planDowngrade(sub.id);
  toonFoto('ná plannen', foto(await stripe.subscriptions.retrieve(sub.id)));

  await stripe.subscriptionSchedules.release(schedule.id);
  const na = foto(await stripe.subscriptions.retrieve(sub.id));
  toonFoto('ná release', na);
  const delta = verschil(voor, na);
  bevinding(
    'B6 release laat het abonnement exact achter zoals het was',
    delta.length === 0 ? 'JA — identiek aan vóór het plannen' : 'NEE',
    delta.join(' | '),
  );

  // Idempotent? Een tweede "toch Premium houden" mag niets stukmaken.
  try {
    await stripe.subscriptionSchedules.release(schedule.id);
    bevinding('B6 een tweede release', 'GEACCEPTEERD');
  } catch (e) {
    bevinding('B6 een tweede release', 'GEWEIGERD — de functie moet dit zelf afvangen', String(e.message).slice(0, 160));
  }

  await klokNaar(omgeving.clock.id, trialEind + UUR, 'einde gratis periode');
  const eind = foto(await stripe.subscriptions.retrieve(sub.id));
  const facturen = await laatsteFactuur(sub.id);
  toonFactuur(facturen[0]);
  bevinding(
    'B6 ná intrekken loopt Premium gewoon door',
    eind.plan === 'premium' && netto(facturen[0]) === 4500 ? 'JA — factuur Premium, €45,00 excl. btw' : 'AFWIJKEND',
    `plan=${eind.plan} status=${eind.status} factuur=${euro(netto(facturen[0]))} excl. btw`,
  );
}

async function scenarioU() {
  const verwachtNetto = (dagenOver, dagenTotaal) => Math.round(((4500 - 2500) * dagenOver) / dagenTotaal);

  for (const vorm of ['create_prorations', 'always_invoice']) {
    const t0 = Math.floor(Date.now() / 1000);
    const omgeving = await maakKlant(`U ${vorm}`, t0);
    const sub = await maakAbonnement(omgeving, 'basic');
    const halverwege = t0 + 15 * DAG;
    await klokNaar(omgeving.clock.id, halverwege, 'dag 15');
    const voor = foto(await stripe.subscriptions.retrieve(sub.id));
    toonFoto(`${vorm} — dag 15`, voor);
    const itemId = (await stripe.subscriptions.retrieve(sub.id)).items.data[0].id;

    // Het bedrag dat de rijschool vóór zijn akkoord te zien krijgt.
    const voorvertoning = await stripe.invoices.createPreview({
      subscription: sub.id,
      subscription_details: {
        items: [{ id: itemId, price: prijzen.premium }],
        proration_behavior: vorm,
        proration_date: halverwege,
      },
    });
    const verrekening = voorvertoning.lines.data.filter((r) => r.parent?.subscription_item_details?.proration ?? r.proration);
    const verrekend = verrekening.reduce((s, r) => s + r.amount, 0);
    console.log(`  voorvertoning: totaal ${euro(voorvertoning.total)}; verrekening netto ${euro(verrekend)} in ${verrekening.length} regel(s)`);
    verrekening.forEach((r) => console.log(`      ${euro(r.amount).padStart(9)}  ${r.description}`));

    const facturenVoor = (await laatsteFactuur(sub.id)).length;
    const bijgewerkt = await stripe.subscriptions.update(sub.id, {
      items: [{ id: itemId, price: prijzen.premium }],
      proration_behavior: vorm,
      proration_date: halverwege,
    });
    const direct = foto(bijgewerkt);
    toonFoto(`${vorm} — direct erna`, direct);
    const facturenDirect = await laatsteFactuur(sub.id);

    if (vorm === 'create_prorations') {
      const wachtend = await stripe.invoiceItems.list({ customer: omgeving.klant.id, pending: true, limit: 10 });
      const som = wachtend.data.reduce((s, r) => s + r.amount, 0);
      bevinding(
        'U-b verschil bij de volgende incasso: direct na de upgrade',
        direct.plan === 'premium' && direct.status === 'active' && facturenDirect.length === facturenVoor
          ? `JA — Premium per direct, status active, géén nieuwe factuur; ${euro(som)} staat klaar voor de volgende`
          : 'AFWIJKEND',
        `plan=${direct.plan} status=${direct.status} facturen ${facturenVoor}→${facturenDirect.length} wachtend=${euro(som)} (verwacht ±${euro(verwachtNetto(voor.current_period_end - halverwege, voor.current_period_end - t0))} excl.)`,
      );
      await klokNaar(omgeving.clock.id, voor.current_period_end + UUR, 'einde periode 1');
      const eind = foto(await stripe.subscriptions.retrieve(sub.id));
      const facturen = await laatsteFactuur(sub.id);
      console.log('  de eerstvolgende factuur:');
      toonFactuur(facturen[0]);
      bevinding(
        'U-b de volgende factuur draagt Premium plus het verschil',
        facturen[0].lines.data.length > 1 ? `JA — ${facturen[0].lines.data.length} regels, totaal ${euro(facturen[0].total)}` : 'AFWIJKEND',
        `status abonnement direct na de incasso-aanmaak: ${eind.status}`,
      );
    } else {
      const nieuw = facturenDirect[0];
      toonFactuur(nieuw);
      bevinding(
        'U-a aparte incasso nu: status zolang de incasso onderweg is',
        `status=${direct.status}`,
        `nieuwe factuur ${euro(nieuw.total)} status=${nieuw.status} billing_reason=${nieuw.billing_reason} — ` +
          (direct.status === 'past_due' ? 'past_due BEVESTIGD: de waarschuwingsbalk zou verschijnen' : 'geen past_due'),
      );
      // Een test-incasso rondt af op ECHTE tijd, niet op kloktijd (scenario P).
      // Dus hier wachten, niet de klok vooruitzetten.
      let later;
      let factuurLater;
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 15_000));
        later = foto(await stripe.subscriptions.retrieve(sub.id));
        factuurLater = (await laatsteFactuur(sub.id)).find((f) => f.id === nieuw.id);
        if (factuurLater.status === 'paid') break;
      }
      bevinding(
        'U-a zodra de incasso is geslaagd',
        `status=${later.status}`,
        `factuur status=${factuurLater.status} — ` +
          (later.status === 'active' && factuurLater.status === 'paid'
            ? 'past_due duurt precies zo lang als de incasso onderweg is (live: dagen)'
            : 'niet teruggekeerd naar active binnen de wachttijd'),
      );
    }
    console.log('  events (oudste eerst):');
    await toonEvents(t0 - 60, sub.id);
  }
}

/**
 * Controle van de meetopzet. In de andere scenario's bleven facturen `open`
 * staan. Dat kan betekenen dat de incasso nog onderweg is, of dat hij in deze
 * opzet nooit afrondt. Zonder dat te weten is "acht dagen later nog past_due"
 * niet te duiden.
 */
async function scenarioP() {
  const t0 = Math.floor(Date.now() / 1000);
  const omgeving = await maakKlant('P incasso', t0);
  const sub = await maakAbonnement(omgeving, 'basic');

  const stand = async (label) => {
    const s = await stripe.subscriptions.retrieve(sub.id);
    const factuur = (await laatsteFactuur(sub.id))[0];
    const metBetalingen = await stripe.invoices.retrieve(factuur.id, { expand: ['payments'] });
    const betaling = metBetalingen.payments?.data?.[0];
    const piId = betaling?.payment?.payment_intent;
    const pi = piId ? await stripe.paymentIntents.retrieve(typeof piId === 'string' ? piId : piId.id) : null;
    console.log(
      `  ${label.padEnd(10)} abonnement=${s.status}  factuur=${factuur.status}  betaling=${betaling?.status ?? '—'}  ` +
        `incasso=${pi?.status ?? '—'}${pi?.last_payment_error ? `  fout=${pi.last_payment_error.code}` : ''}`,
    );
    return { sub: s.status, factuur: factuur.status, incasso: pi?.status ?? null };
  };

  const begin = await stand('direct');
  await klokNaar(omgeving.clock.id, t0 + 3 * DAG, 'dag 3');
  await stand('dag 3');
  await klokNaar(omgeving.clock.id, t0 + 10 * DAG, 'dag 10');
  const dag10 = await stand('dag 10');
  // Echte tijd laten verstrijken: rondt Stripe de test-incasso dan af?
  await new Promise((r) => setTimeout(r, 90_000));
  const naWachten = await stand('+90s echt');

  bevinding(
    'P rondt een SEPA-incasso af in deze meetopzet?',
    naWachten.factuur === 'paid' || dag10.factuur === 'paid'
      ? `JA — ${dag10.factuur === 'paid' ? 'na het vooruitzetten van de klok' : 'pas na echte wachttijd'}`
      : 'NEE — de factuur blijft open',
    `direct: incasso=${begin.incasso} factuur=${begin.factuur} · dag 10: incasso=${dag10.incasso} factuur=${dag10.factuur} · ná 90s: incasso=${naWachten.incasso} factuur=${naWachten.factuur}`,
  );
}

// ── Draaien ─────────────────────────────────────────────────────────────────
const UITVOERDERS = { B1: scenarioB1, B2: scenarioB2, B3: scenarioB3, B5: scenarioB5, B6: scenarioB6, U: scenarioU, P: scenarioP };
const mislukt = [];

try {
  console.log(`API-versie ${API_VERSION} · testmodus · scenario's: ${teDraaien.join(', ')}\n`);
  prijzen = await maakPrijzen();
  console.log(`testprijzen: basic ${prijzen.basic} (€25,00) · premium ${prijzen.premium} (€45,00)`);

  for (const naam of teDraaien) {
    console.log(`\n════ ${naam} — ${SCENARIOS[naam]} ════`);
    try {
      await UITVOERDERS[naam]();
    } catch (e) {
      mislukt.push(naam);
      console.error(`  ✖ scenario ${naam} afgebroken: ${e.message}`);
      bevinding(`${naam} — scenario afgebroken`, 'GEEN UITKOMST', String(e.message).slice(0, 220));
    }
  }
} finally {
  console.log('\n════ opruimen ════');
  for (const id of opruimen.klokken) {
    await stripe.testHelpers.testClocks.del(id).catch((e) => console.error(`  klok ${id}: ${e.message}`));
  }
  for (const id of opruimen.coupons) await stripe.coupons.del(id).catch(() => {});
  for (const id of opruimen.prijzen) await stripe.prices.update(id, { active: false }).catch(() => {});
  for (const id of opruimen.producten) await stripe.products.update(id, { active: false }).catch(() => {});
  console.log(`  ${opruimen.klokken.length} testklok(ken) verwijderd (incl. klanten en abonnementen), prijzen en producten gearchiveerd`);

  console.log('\n════ BEVINDINGEN ════');
  for (const b of bevindingen) {
    console.log(`\n• ${b.vraag}\n  → ${b.uitkomst}${b.detail ? `\n    ${b.detail}` : ''}`);
  }
  console.log('\nLet op: de testomgeving rekent 0% btw (geen registratie); live komt er 21% bij. Bedragen hierboven zijn excl. btw.');
  if (!belasting) console.log('Automatische btw stond in deze run uit.');
  if (mislukt.length) console.log(`\nAfgebroken: ${mislukt.join(', ')}`);
}

process.exit(mislukt.length ? 1 : 0);
