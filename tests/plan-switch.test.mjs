// Wisselen naar Basic op /upgrade (→ ribbaPro stripe-change-plan): juiste
// aanroep per actie, Nederlandse foutafhandeling, en fail-closed wat de
// pagina laat zien. De wissel zelf is in ribbaPro bewezen (vitest + probe
// tegen de Stripe-testomgeving).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  callChangePlan,
  changePlanFunctionUrl,
  formatSwitchDate,
  planSwitchView,
  statusFromResult,
  GENERIC_SWITCH_ERROR,
  NETWORK_SWITCH_ERROR,
} = await import('../lib/plan-switch.ts');

const SCHOOL = '0218195e-e6a9-403d-953d-c9cb5501f834';

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { fn, calls };
}

test('url: wijst naar de edge function, met of zonder slash', () => {
  assert.equal(changePlanFunctionUrl('https://x.supabase.co/'), 'https://x.supabase.co/functions/v1/stripe-change-plan');
  assert.equal(changePlanFunctionUrl('https://x.supabase.co'), 'https://x.supabase.co/functions/v1/stripe-change-plan');
});

test('schedule: stuurt plan basic en attempt_id mee, met de gebruikers-JWT', async () => {
  const { fn, calls } = fakeFetch(200, { success: true, scheduled: true, switch_at: '2026-11-01T11:28:00.000Z' });
  const r = await callChangePlan({
    supabaseUrl: 'https://x.supabase.co', accessToken: 'jwt', schoolId: SCHOOL,
    action: 'schedule', attemptId: 'a-1', fetchImpl: fn,
  });
  assert.deepEqual(r, { ok: true, scheduled: true, switchAt: '2026-11-01T11:28:00.000Z' });
  assert.deepEqual(calls[0].body, { school_id: SCHOOL, action: 'schedule', plan: 'basic', attempt_id: 'a-1' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt');
});

test('undo en status: geen plan, geen attempt_id', async () => {
  for (const action of ['undo', 'status']) {
    const { fn, calls } = fakeFetch(200, { success: true, scheduled: false });
    const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action, attemptId: 'x', fetchImpl: fn });
    assert.deepEqual(r, { ok: true, scheduled: false, switchAt: null });
    assert.deepEqual(calls[0].body, { school_id: SCHOOL, action });
  }
});

test('fout van de server: tekst ongewijzigd door, poging afgesloten', async () => {
  const tekst = 'Je rijschool heeft 31 actieve leerlingen (max 30 voor Basic). Kies Premium of archiveer leerlingen.';
  const { fn } = fakeFetch(400, { error: tekst });
  const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'schedule', attemptId: 'a', fetchImpl: fn });
  assert.deepEqual(r, { ok: false, error: tekst, kind: 'definitive' });
});

test('lege fout of onleesbare body → generieke Nederlandse melding', async () => {
  const { fn } = fakeFetch(502, undefined);
  const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'undo', fetchImpl: fn });
  assert.deepEqual(r, { ok: false, error: GENERIC_SWITCH_ERROR, kind: 'definitive' });
});

test('200 zonder success:true geldt niet als gelukt', async () => {
  const { fn } = fakeFetch(200, { scheduled: true });
  const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'status', fetchImpl: fn });
  assert.equal(r.ok, false);
});

test('half antwoord: scheduled ontbreekt, of true zonder leesbare datum → fout, geen "gelukt"', async () => {
  for (const body of [{ success: true }, { success: true, scheduled: 'ja' }, { success: true, scheduled: true }, { success: true, scheduled: true, switch_at: 'morgen' }]) {
    const { fn } = fakeFetch(200, body);
    const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'status', fetchImpl: fn });
    assert.deepEqual(r, { ok: false, error: GENERIC_SWITCH_ERROR, kind: 'definitive' }, JSON.stringify(body));
  }
});

test('time-out: een hangende aanroep wordt afgebroken en geldt als netwerkfout', async () => {
  const hangt = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const r = await callChangePlan({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'status', fetchImpl: hangt, timeoutMs: 20 });
  assert.deepEqual(r, { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network' });
});

test('/upgrade: na een mislukte wissel of terugdraai wordt de stand opnieuw bij Stripe gelezen', () => {
  const src = readFileSync(new URL('../app/upgrade/page.tsx', import.meta.url), 'utf8');
  const fout = src.indexOf('if (!result.ok) {', src.indexOf('const runSwitch'));
  const herlezen = src.indexOf("action: 'status'", fout);
  assert.ok(fout > 0 && herlezen > fout && herlezen < src.indexOf('return;', fout + 200) + 50);
});

test('netwerkfout → kind network (zelfde poging mag hervatten)', async () => {
  const r = await callChangePlan({
    supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, action: 'schedule', attemptId: 'a',
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  assert.deepEqual(r, { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network' });
});

test('statusFromResult: fail-closed', () => {
  assert.deepEqual(statusFromResult({ ok: false, error: 'x', kind: 'definitive' }), { known: false });
  assert.deepEqual(statusFromResult({ ok: true, scheduled: true, switchAt: null }), { known: false });
  assert.deepEqual(statusFromResult({ ok: true, scheduled: false, switchAt: null }), { known: true, scheduled: false });
  assert.deepEqual(
    statusFromResult({ ok: true, scheduled: true, switchAt: '2026-11-01T00:00:00Z' }),
    { known: true, scheduled: true, switchAt: '2026-11-01T00:00:00Z' },
  );
});

const basis = {
  canManageSubscription: true,
  currentPlan: 'premium',
  isTrial: false,
  cancelled: false,
  status: { known: true, scheduled: false },
};

test('view: eigenaar met Premium en niets gepland → de knop', () => {
  assert.deepEqual(planSwitchView(basis), { kind: 'offer' });
});

test('view: gepland → datum en "toch Premium houden"', () => {
  const v = planSwitchView({ ...basis, status: { known: true, scheduled: true, switchAt: '2026-11-01T11:28:00Z' } });
  assert.deepEqual(v, { kind: 'scheduled', switchAt: '2026-11-01T11:28:00Z' });
});

test('view: geen knop voor wie niet beheert, een oude proef, een opgezegd abonnement, Basic, of een onbekende stand', () => {
  assert.deepEqual(planSwitchView({ ...basis, canManageSubscription: false }), { kind: 'none' });
  assert.deepEqual(planSwitchView({ ...basis, isTrial: true }), { kind: 'none' });
  assert.deepEqual(planSwitchView({ ...basis, cancelled: true }), { kind: 'none' });
  assert.deepEqual(planSwitchView({ ...basis, currentPlan: 'basic' }), { kind: 'none' });
  assert.deepEqual(planSwitchView({ ...basis, currentPlan: null }), { kind: 'none' });
  assert.deepEqual(planSwitchView({ ...basis, status: { known: false } }), { kind: 'none' });
});

test('view: opgezegd gaat vóór een geplande wissel', () => {
  const v = planSwitchView({ ...basis, cancelled: true, status: { known: true, scheduled: true, switchAt: '2026-11-01T00:00:00Z' } });
  assert.deepEqual(v, { kind: 'none' });
});

test('datum: Nederlandse tijd, voluit', () => {
  assert.equal(formatSwitchDate('2026-11-01T11:28:00Z'), '1 november 2026');
  assert.equal(formatSwitchDate('2026-10-31T23:30:00Z'), '1 november 2026');
});

test('/upgrade: de wisselknop opent eerst een bevestiging, en de status komt uit Stripe', () => {
  const src = readFileSync(new URL('../app/upgrade/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /Na deze periode naar Basic/);
  assert.match(src, /onClick=\{\(\) => setShowSwitchModal\(true\)\}/);
  assert.match(src, /Toch Premium houden/);
  assert.match(src, /action: 'status'/);
});

// ── Upgraden naar Premium binnen het abonnement ─────────────────────────────

const { previewUpgrade, confirmUpgrade, upgradeConfirmText } = await import('../lib/plan-switch.ts');

const euro = (c) => `€${(c / 100).toFixed(2).replace('.', ',')}`;
const goedePreview = {
  success: true, proration_date: 1790000000, in_free_period: false,
  difference_excl_cents: 1033, difference_incl_cents: 1250, currency: 'eur',
  next_invoice_at: '2026-11-01T11:28:00.000Z',
};

test('upgrade-voorvertoning: vraagt Premium en leest het bedrag uit Stripe', async () => {
  const { fn, calls } = fakeFetch(200, goedePreview);
  const r = await previewUpgrade({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, fetchImpl: fn });
  assert.deepEqual(calls[0].body, { school_id: SCHOOL, action: 'upgrade_preview', plan: 'premium' });
  assert.deepEqual(r, { ok: true, preview: {
    prorationDate: 1790000000, inFreePeriod: false, differenceExclCents: 1033, differenceInclCents: 1250,
    nextInvoiceAt: '2026-11-01T11:28:00.000Z',
  } });
});

test('upgrade-voorvertoning: een onvolledig antwoord geeft geen toestemmingsvraag', async () => {
  for (const kapot of [
    { ...goedePreview, proration_date: undefined },
    { ...goedePreview, difference_excl_cents: '10,33' },
    { ...goedePreview, next_invoice_at: 'binnenkort' },
    { ...goedePreview, in_free_period: undefined },
  ]) {
    const { fn } = fakeFetch(200, kapot);
    const r = await previewUpgrade({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, fetchImpl: fn });
    assert.equal(r.ok, false, JSON.stringify(kapot));
  }
});

test('upgrade-voorvertoning: fouttekst van de server ongewijzigd door', async () => {
  const { fn } = fakeFetch(409, { error: 'Je abonnement is opgezegd. Een planwissel kan dan niet.' });
  const r = await previewUpgrade({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, fetchImpl: fn });
  assert.deepEqual(r, { ok: false, error: 'Je abonnement is opgezegd. Een planwissel kan dan niet.', kind: 'definitive' });
});

test('upgrade: stuurt de proration_date van de voorvertoning en de attempt_id mee', async () => {
  const { fn, calls } = fakeFetch(200, { success: true, upgraded: true, plan: 'premium' });
  const r = await confirmUpgrade({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, attemptId: 'a-1', prorationDate: 1790000000, fetchImpl: fn });
  assert.deepEqual(r, { ok: true, upgraded: true });
  assert.deepEqual(calls[0].body, { school_id: SCHOOL, action: 'upgrade', plan: 'premium', attempt_id: 'a-1', proration_date: 1790000000 });
});

test('upgrade: verlopen bedrag → fout met reden, poging afgesloten', async () => {
  const { fn } = fakeFetch(409, { error: 'Het bedrag is verlopen. Vraag het opnieuw op en bevestig dan.', reason: 'preview_expired' });
  const r = await confirmUpgrade({ supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, attemptId: 'a', prorationDate: 1, fetchImpl: fn });
  assert.deepEqual(r, { ok: false, error: 'Het bedrag is verlopen. Vraag het opnieuw op en bevestig dan.', kind: 'definitive', reason: 'preview_expired' });
});

test('upgrade: netwerkfout → kind network (zelfde attempt_id mag hervatten)', async () => {
  const r = await confirmUpgrade({
    supabaseUrl: 'https://x', accessToken: 'jwt', schoolId: SCHOOL, attemptId: 'a', prorationDate: 1,
    fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'network');
});

test('bevestigingstekst: betaalde maand noemt het verschil en de incassodatum', () => {
  const t = upgradeConfirmText({ prorationDate: 1, inFreePeriod: false, differenceExclCents: 1033, differenceInclCents: 1250, nextInvoiceAt: '2026-11-01T11:28:00Z' }, '€45,00', euro);
  assert.equal(t, 'Je gaat direct over op Premium. Voor de rest van deze periode komt er €10,33 excl. btw (€12,50 incl. btw) bij je volgende incasso op 1 november 2026. Daarna betaal je €45,00 per maand excl. btw.');
});

test('bevestigingstekst: zonder btw uit Stripe alleen excl. btw, niets geraden', () => {
  const t = upgradeConfirmText({ prorationDate: 1, inFreePeriod: false, differenceExclCents: 1033, differenceInclCents: null, nextInvoiceAt: '2026-11-01T11:28:00Z' }, '€45,00', euro);
  assert.match(t, /€10,33 excl\. btw bij je volgende incasso/);
  assert.doesNotMatch(t, /incl\. btw/);
});

test('bevestigingstekst: gratis periode → niets extra', () => {
  const t = upgradeConfirmText({ prorationDate: 1, inFreePeriod: true, differenceExclCents: 0, differenceInclCents: 0, nextInvoiceAt: '2026-11-01T11:28:00Z' }, '€45,00', euro);
  assert.equal(t, 'Je gaat direct over op Premium. In je gratis periode betaal je niets extra. Vanaf 1 november 2026 betaal je €45,00 per maand excl. btw.');
});

test('/upgrade: Basic met Stripe-abonnement upgradet binnen het abonnement, anders de checkout', () => {
  const src = readFileSync(new URL('../app/upgrade/page.tsx', import.meta.url), 'utf8');
  assert.match(src, /const upgradeInSubscription = currentPlan === 'basic' && !isTrial && switchStatus\.known;/);
  assert.match(src, /upgradeInSubscription \? startUpgrade\(\) : handleCheckout\('premium'\)/);
  assert.match(src, /Nu upgraden naar Premium\?/);
});
