// Zelf overstappen tussen maandelijks en jaarlijks op /upgrade (F4, J6–J9):
// status lezen (fail-closed), de bevestigingsteksten met de juiste bedragen,
// één attempt_id per poging, en wat elkaar uitsluit. De wissel zelf is in
// ribbaPro bewezen (stripe-change-plan, testmodus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  parseIntervalStatus,
  intervalConfirmText,
  huidigePeriodeTekst,
  geplandTekst,
  intrekKnopTekst,
  overstapKnopTekst,
  directGewisseldTekst,
  intervalView,
  planWisselGeblokkeerd,
  createIntervalAttempts,
  inGratisPeriode,
  PERIODE_GEBLOKKEERD_DOOR_PLANWISSEL,
} = await import('../lib/interval-switch.ts');
const { callChangePlan, callIntervalChange, intervalStatusFromResult, statusFromResult, GENERIC_SWITCH_ERROR, NETWORK_SWITCH_ERROR } =
  await import('../lib/plan-switch.ts');

const SCHOOL = '0218195e-e6a9-403d-953d-c9cb5501f834';
const EINDE = '2026-11-01T11:28:00.000Z';

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { fn, calls };
}
const basisOpts = { supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL };

// ── Status lezen ────────────────────────────────────────────────────────────

test('status: interval en geplande periodewissel worden gelezen', () => {
  assert.deepEqual(parseIntervalStatus({ interval: 'maand', interval_change: null }), { known: true, interval: 'maand', change: null });
  assert.deepEqual(
    parseIntervalStatus({ interval: 'maand', interval_change: { naar: 'jaar', switch_at: EINDE } }),
    { known: true, interval: 'maand', change: { naar: 'jaar', switchAt: EINDE } },
  );
});

test('status: ontbrekende velden → null (oudere server)', () => {
  assert.deepEqual(parseIntervalStatus({}), { known: true, interval: null, change: null });
  assert.deepEqual(parseIntervalStatus({ interval: 'jaar' }), { known: true, interval: 'jaar', change: null });
});

test('status: onbekende waarden → onbekend, nooit raden', () => {
  for (const d of [
    { interval: 'week' },
    { interval: 'month' },
    { interval: 'maand', interval_change: { naar: 'kwartaal', switch_at: EINDE } },
    { interval: 'maand', interval_change: { naar: 'jaar', switch_at: 'binnenkort' } },
    { interval: 'maand', interval_change: { naar: 'jaar' } },
    { interval: 'maand', interval_change: 'jaar' },
    { interval: 'maand', interval_change: [] },
  ]) {
    assert.deepEqual(parseIntervalStatus(d), { known: false }, JSON.stringify(d));
  }
});

test('status via callChangePlan: periode alleen bij status, en een kapotte periode laat de Basic-stand staan', async () => {
  const goed = await callChangePlan({ ...basisOpts, action: 'status', fetchImpl: fakeFetch(200, {
    success: true, scheduled: false, interval: 'jaar', interval_change: { naar: 'maand', switch_at: EINDE },
  }).fn });
  assert.deepEqual(intervalStatusFromResult(goed), { known: true, interval: 'jaar', change: { naar: 'maand', switchAt: EINDE } });

  const kapot = await callChangePlan({ ...basisOpts, action: 'status', fetchImpl: fakeFetch(200, { success: true, scheduled: false, interval: 'week' }).fn });
  assert.deepEqual(intervalStatusFromResult(kapot), { known: false });
  assert.deepEqual(statusFromResult(kapot), { known: true, scheduled: false });

  const fout = await callChangePlan({ ...basisOpts, action: 'status', fetchImpl: fakeFetch(404, { error: 'Geen abonnement.' }).fn });
  assert.deepEqual(intervalStatusFromResult(fout), { known: false });

  const undo = await callChangePlan({ ...basisOpts, action: 'undo', fetchImpl: fakeFetch(200, { success: true, scheduled: false, interval: 'jaar' }).fn });
  assert.equal('periode' in undo, false);
  assert.deepEqual(intervalStatusFromResult(undo), { known: false });
});

// ── Teksten en bedragen ─────────────────────────────────────────────────────

test('bevestiging maand → jaar (betalend), Basic: €300 / €363', () => {
  assert.equal(
    intervalConfirmText({ plan: 'basic', naar: 'jaar', inFreePeriod: false, datum: EINDE }),
    'Vanaf 1 november 2026 betaal je €300 per jaar excl. btw (€363 incl. btw). Tot die dag verandert er niets; intrekken kan tot dan.',
  );
});

test('bevestiging maand → jaar (betalend), Premium: €540 / €653,40 en de website-service', () => {
  assert.equal(
    intervalConfirmText({ plan: 'premium', naar: 'jaar', inFreePeriod: false, datum: EINDE }),
    'Vanaf 1 november 2026 betaal je €540 per jaar excl. btw (€653,40 incl. btw). Tot die dag verandert er niets; intrekken kan tot dan. Daarbij: wij verzorgen je eigen website — ontwerp, (her)bouw en support.',
  );
});

test('bevestiging jaar → maand: jaar loopt door, geen geld terug, €45 / €54,45', () => {
  assert.equal(
    intervalConfirmText({ plan: 'premium', naar: 'maand', inFreePeriod: false, datum: EINDE }),
    'Je jaar loopt door tot 1 november 2026. Daarna betaal je €45 per maand excl. btw (€54,45 incl. btw). Geld terug is er niet. De website-service hoort alleen bij jaarlijks betalen.',
  );
  assert.equal(
    intervalConfirmText({ plan: 'basic', naar: 'maand', inFreePeriod: false, datum: EINDE }),
    'Je jaar loopt door tot 1 november 2026. Daarna betaal je €25 per maand excl. btw (€30,25 incl. btw). Geld terug is er niet.',
  );
});

test('bevestiging in de gratis periode: de gratis periode blijft', () => {
  assert.equal(
    intervalConfirmText({ plan: 'premium', naar: 'jaar', inFreePeriod: true, datum: EINDE }),
    'Je gratis periode blijft tot 1 november 2026. Daarna betaal je €540 per jaar excl. btw (€653,40 incl. btw). Daarbij: wij verzorgen je eigen website — ontwerp, (her)bouw en support.',
  );
  assert.equal(
    intervalConfirmText({ plan: 'basic', naar: 'maand', inFreePeriod: true, datum: EINDE }),
    'Je gratis periode blijft tot 1 november 2026. Daarna betaal je €25 per maand excl. btw (€30,25 incl. btw).',
  );
});

test('bevestiging zonder (leesbare) datum: geen geraden datum', () => {
  for (const datum of [null, 'binnenkort']) {
    const t = intervalConfirmText({ plan: 'basic', naar: 'jaar', inFreePeriod: false, datum });
    assert.equal(t, 'Vanaf je volgende betaaldatum betaal je €300 per jaar excl. btw (€363 incl. btw). Tot die dag verandert er niets; intrekken kan tot dan.');
  }
});

test('kaartteksten', () => {
  assert.equal(huidigePeriodeTekst('premium', 'maand'), 'Je betaalt maandelijks: €45 per maand excl. btw.');
  assert.equal(huidigePeriodeTekst('premium', 'jaar'), 'Je betaalt jaarlijks: €540 per jaar excl. btw.');
  assert.equal(huidigePeriodeTekst('basic', 'jaar'), 'Je betaalt jaarlijks: €300 per jaar excl. btw.');
  assert.equal(overstapKnopTekst('jaar'), 'Overstappen naar jaarlijks');
  assert.equal(overstapKnopTekst('maand'), 'Terug naar maandelijks');
  assert.equal(geplandTekst({ naar: 'jaar', switchAt: EINDE }), 'Per 1 november 2026 betaal je jaarlijks.');
  assert.equal(geplandTekst({ naar: 'maand', switchAt: EINDE }), 'Per 1 november 2026 betaal je maandelijks.');
  assert.equal(intrekKnopTekst({ naar: 'jaar', switchAt: EINDE }), 'Toch maandelijks houden');
  assert.equal(intrekKnopTekst({ naar: 'maand', switchAt: EINDE }), 'Toch jaarlijks houden');
  assert.equal(directGewisseldTekst('jaar', EINDE), 'Gelukt: je betaalt voortaan jaarlijks. Je gratis periode blijft tot 1 november 2026.');
});

test('gratis periode: alleen een trialEndsAt in de toekomst telt', () => {
  const nu = new Date('2026-10-24T12:00:00Z');
  assert.equal(inGratisPeriode(EINDE, nu), true);
  assert.equal(inGratisPeriode('2026-10-01T00:00:00Z', nu), false);
  assert.equal(inGratisPeriode(null, nu), false);
  assert.equal(inGratisPeriode('ooit', nu), false);
});

// ── De aanroep ──────────────────────────────────────────────────────────────

test('interval_schedule: stuurt naar en attempt_id; betalend → gepland met de serverdatum', async () => {
  const { fn, calls } = fakeFetch(200, { success: true, interval_change: { naar: 'jaar', switch_at: EINDE }, already_scheduled: false });
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'jaar', attemptId: 'a-1', fetchImpl: fn });
  assert.deepEqual(calls[0].body, { school_id: SCHOOL, action: 'interval_schedule', naar: 'jaar', attempt_id: 'a-1' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(r, { ok: true, uitkomst: 'gepland', change: { naar: 'jaar', switchAt: EINDE } });
});

test('interval_schedule: gratis periode → direct, met next_invoice_at', async () => {
  const { fn } = fakeFetch(200, { success: true, changed: true, interval: 'jaar', in_free_period: true, next_invoice_at: EINDE });
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'jaar', attemptId: 'a', fetchImpl: fn });
  assert.deepEqual(r, { ok: true, uitkomst: 'direct', interval: 'jaar', nextInvoiceAt: EINDE });
});

test('interval_schedule: al op die periode → niets gepland', async () => {
  const { fn } = fakeFetch(200, { success: true, interval_change: null, already_on_interval: true });
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'maand', attemptId: 'a', fetchImpl: fn });
  assert.deepEqual(r, { ok: true, uitkomst: 'geen' });
});

test('interval_schedule: half of tegenstrijdig antwoord geldt niet als gelukt', async () => {
  for (const body of [
    { success: true },
    { success: true, interval_change: { naar: 'maand', switch_at: EINDE } },
    { success: true, interval_change: { naar: 'jaar', switch_at: 'later' } },
    { success: true, changed: true, interval: 'maand', in_free_period: true, next_invoice_at: EINDE },
    { interval_change: { naar: 'jaar', switch_at: EINDE } },
  ]) {
    const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'jaar', attemptId: 'a', fetchImpl: fakeFetch(200, body).fn });
    assert.deepEqual(r, { ok: false, error: GENERIC_SWITCH_ERROR, kind: 'definitive', reason: null }, JSON.stringify(body));
  }
});

test('interval_schedule: fouttekst van de server ongewijzigd door, met reden', async () => {
  const tekst = 'Er staat een wissel naar Basic gepland. Trek die eerst in of wacht tot hij is ingegaan.';
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'jaar', attemptId: 'a', fetchImpl: fakeFetch(409, { error: tekst, reason: 'plan_change_pending' }).fn });
  assert.deepEqual(r, { ok: false, error: tekst, kind: 'definitive', reason: 'plan_change_pending' });
});

test('interval_schedule zonder attempt_id of naar wordt niet verstuurd', async () => {
  const { fn, calls } = fakeFetch(200, { success: true });
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_schedule', naar: 'jaar', fetchImpl: fn });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('interval_undo: geen naar, geen attempt_id; netwerkfout → kind network', async () => {
  const { fn, calls } = fakeFetch(200, { success: true, interval_change: null, released: true });
  const r = await callIntervalChange({ ...basisOpts, action: 'interval_undo', naar: 'jaar', attemptId: 'x', fetchImpl: fn });
  assert.deepEqual(calls[0].body, { school_id: SCHOOL, action: 'interval_undo' });
  assert.deepEqual(r, { ok: true, uitkomst: 'geen' });

  const weg = await callIntervalChange({ ...basisOpts, action: 'interval_undo', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(weg, { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network', reason: null });

  const conflict = await callIntervalChange({ ...basisOpts, action: 'interval_undo', fetchImpl: fakeFetch(409, { error: 'Er staat een wissel naar Basic gepland.' }).fn });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error, 'Er staat een wissel naar Basic gepland.');
});

// ── attempt_id ──────────────────────────────────────────────────────────────

test('attempt_id: zelfde poging hervat dezelfde id; afgesloten of andere richting → nieuwe id', () => {
  let n = 0;
  const a = createIntervalAttempts(() => `id-${++n}`);
  const eerste = a.idVoor('jaar');
  assert.equal(a.idVoor('jaar'), eerste, 'netwerkfout: zelfde poging, zelfde id');
  assert.notEqual(a.idVoor('maand'), eerste, 'andere parameters: nooit dezelfde id');
  const maand = a.idVoor('maand');
  a.afsluiten();
  assert.notEqual(a.idVoor('maand'), maand, 'na een antwoord: nieuwe poging');
});

// ── Wat de pagina toont, en wat elkaar uitsluit ─────────────────────────────

const basis = {
  canManageSubscription: true,
  currentPlan: 'premium',
  isTrial: false,
  cancelled: false,
  planStatus: { known: true, scheduled: false },
  status: { known: true, interval: 'maand', change: null },
};

test('view: eigenaar, maandelijks, niets gepland → overstappen naar jaarlijks', () => {
  assert.deepEqual(intervalView(basis), { kind: 'offer', plan: 'premium', huidig: 'maand', naar: 'jaar', geblokkeerd: null });
  assert.deepEqual(
    intervalView({ ...basis, currentPlan: 'basic', status: { known: true, interval: 'jaar', change: null } }),
    { kind: 'offer', plan: 'basic', huidig: 'jaar', naar: 'maand', geblokkeerd: null },
  );
});

test('view: periodewissel gepland → datum en intrekknop', () => {
  const change = { naar: 'jaar', switchAt: EINDE };
  assert.deepEqual(intervalView({ ...basis, status: { known: true, interval: 'maand', change } }), { kind: 'scheduled', plan: 'premium', huidig: 'maand', change });
});

test('view: geen kaart zonder eigenaar, bij een oude proef, opgezegd, zonder betaald plan, of bij een onbekende stand/periode', () => {
  assert.deepEqual(intervalView({ ...basis, canManageSubscription: false }), { kind: 'none' });
  assert.deepEqual(intervalView({ ...basis, isTrial: true }), { kind: 'none' });
  assert.deepEqual(intervalView({ ...basis, cancelled: true }), { kind: 'none' });
  assert.deepEqual(intervalView({ ...basis, currentPlan: null }), { kind: 'none' });
  assert.deepEqual(intervalView({ ...basis, status: { known: false } }), { kind: 'none' });
  assert.deepEqual(intervalView({ ...basis, status: { known: true, interval: null, change: null } }), { kind: 'none' });
});

test('conflict: wissel naar Basic gepland → periodeknop geblokkeerd met uitleg', () => {
  const v = intervalView({ ...basis, planStatus: { known: true, scheduled: true, switchAt: EINDE } });
  assert.equal(v.kind, 'offer');
  assert.equal(v.geblokkeerd, PERIODE_GEBLOKKEERD_DOOR_PLANWISSEL);
  assert.equal(v.geblokkeerd, 'Je wissel naar Basic staat gepland. Trek die eerst in om je betaalperiode te wijzigen.');
});

test('conflict: periodewissel gepland → planwissel geblokkeerd met uitleg; anders niet', () => {
  assert.equal(
    planWisselGeblokkeerd({ known: true, interval: 'maand', change: { naar: 'jaar', switchAt: EINDE } }),
    'Je overstap naar jaarlijks betalen staat gepland. Trek die eerst in om van plan te wisselen.',
  );
  assert.equal(planWisselGeblokkeerd({ known: true, interval: 'maand', change: null }), null);
  assert.equal(planWisselGeblokkeerd({ known: false }), null);
});

test('/upgrade: kaart, bevestiging, intrekken en blokkades zijn aangesloten', () => {
  const src = readFileSync(new URL('../app/(site)/upgrade/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /setIntervalStatus\(intervalStatusFromResult\(statusResult\)\)/);
  assert.match(src, /onClick=\{\(\) => setShowIntervalModal\(true\)\}/);
  assert.match(src, /intervalConfirmText\(/);
  assert.match(src, /runIntervalChange\('undo'\)/);
  assert.match(src, /attemptId: intervalAttemptsRef\.current\.idVoor\(naar\)/);
  // Na elke overstapactie de stand opnieuw bij Stripe lezen.
  const run = src.indexOf('const runIntervalChange');
  assert.ok(src.indexOf('await herlaadStatus(token)', run) > run);
  // Blokkades: Basic-wissel en upgrade binnen het abonnement.
  assert.match(src, /disabled=\{switching !== null \|\| basicBlockedReason !== null \|\| planWisselBlok !== null\}/);
  assert.match(src, /disabled=\{loading !== null \|\| upgrading !== null \|\| upgradeBlok !== null\}/);
});
