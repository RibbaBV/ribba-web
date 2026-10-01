// Routetest voor app/api/cron/trial-reminder/route.ts.
//
// Twee groepen, twee mails:
//   1. school ZONDER abonnement (is_trial = true)   → "kies een abonnement"
//   2. school MET een trialing Stripe-abonnement    → "je abonnement loopt door"
//
// Groep 2 viel tot 2 okt 2026 buiten elke herinnering. Deze test bewaakt dat
// hij er nu in zit, en dat groep 1 zich niet anders is gaan gedragen.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CRON_SECRET = 'cron-geheim';

let currentClient;
let trialMails = [];
let freePeriodMails = [];
let freePeriodMailFout = null;
/** Wat "Stripe" teruggeeft, per subscription-id. Een Error wordt gegooid. */
let stripeSubs = {};
let stripeCalls = [];

mock.module('@supabase/supabase-js', { namedExports: { createClient: () => currentClient } });
mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@/lib/school-emails', {
  namedExports: {
    sendTrialEndingReminderMail: async (...args) => { trialMails.push(args); },
    sendFreePeriodEndingMail: async (...args) => {
      if (freePeriodMailFout) throw freePeriodMailFout;
      freePeriodMails.push(args);
    },
  },
});

mock.module('@/lib/stripe', {
  namedExports: {
    getStripe: () => ({
      subscriptions: {
        retrieve: async (id) => {
          stripeCalls.push(id);
          const antwoord = stripeSubs[id];
          if (antwoord instanceof Error) throw antwoord;
          if (!antwoord) throw new Error(`No such subscription: ${id}`);
          return antwoord;
        },
      },
    }),
  },
});

const { GET } = await import('../app/api/cron/trial-reminder/route.ts');

const CHAIN = ['select', 'eq', 'gte', 'lt', 'in', 'is', 'limit', 'order', 'maybeSingle'];

/** Antwoorden per tabel, in de volgorde waarin de route ze opvraagt. */
function makeClient(perTabel) {
  const wachtrij = Object.fromEntries(Object.entries(perTabel).map(([t, r]) => [t, [...r]]));
  const calls = [];
  return {
    calls,
    from(table) {
      const response = wachtrij[table]?.shift() ?? { data: null, error: null };
      const record = { table, ops: [] };
      calls.push(record);
      const builder = {};
      for (const m of CHAIN) builder[m] = (...args) => { record.ops.push([m, ...args]); return builder; };
      builder.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
      return builder;
    },
  };
}

const verzoek = (secret = 'cron-geheim') => ({
  headers: { get: (h) => (h === 'authorization' && secret ? `Bearer ${secret}` : null) },
});

const overDagen = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
const unixOverDagen = (n) => Math.floor((Date.now() + n * 24 * 60 * 60 * 1000) / 1000);

/** Een subscription zoals Stripe hem teruggeeft, voor zover de route hem leest. */
const stripeSub = ({ plan = 'premium', dagen = 7, opgezegd = false, status = 'trialing' } = {}) => ({
  status,
  trial_end: unixOverDagen(dagen),
  cancel_at: opgezegd ? unixOverDagen(dagen) : null,
  items: { data: [{ price: { metadata: { plan } } }] },
});
/** Eén spiegelrij: de spiegel zegt alleen wie, niet wat. */
const spiegel = (schoolId, subId) => ({ school_id: schoolId, stripe_subscription_id: subId });
const GEEN_LICENTIES = [{ data: [], error: null }, { data: [], error: null }];

function reset() {
  trialMails = [];
  freePeriodMails = [];
  freePeriodMailFout = null;
  stripeSubs = {};
  stripeCalls = [];
}

test('R1: zonder of met een verkeerd cron-geheim → 401, er wordt niets gelezen of verstuurd', async () => {
  reset();
  currentClient = makeClient({});
  for (const secret of [null, 'fout']) {
    const res = await GET(verzoek(secret));
    assert.equal(res.status, 401);
  }
  assert.equal(currentClient.calls.length, 0);
  assert.equal(trialMails.length + freePeriodMails.length, 0);
});

test('R2: school met mandaat, 7 dagen vóór het einde → de nieuwe mail, naar het adres van de rijschool', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub({ plan: 'basic', dagen: 7 }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-mandaat', 'sub_1')], error: null }],
    drivingschools: [{ data: { id: 's-mandaat', name: 'Rijschool Voorbeeld', email: 'info@voorbeeld.nl' }, error: null }],
    billing_events: [{ data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(res.status, 200);
  assert.equal(trialMails.length, 0, 'niet de oude "kies een abonnement"-mail');
  assert.equal(freePeriodMails.length, 1);
  const [email, naam, reminder] = freePeriodMails[0];
  assert.equal(email, 'info@voorbeeld.nl');
  assert.equal(naam, 'Rijschool Voorbeeld');
  assert.deepEqual(
    { schoolId: reminder.schoolId, plan: reminder.plan, daysLeft: reminder.daysLeft },
    { schoolId: 's-mandaat', plan: 'basic', daysLeft: 7 },
  );
  assert.deepEqual(res.body.sent, [{ school_id: 's-mandaat', days: 7, email: 'info@voorbeeld.nl' }]);

  // De spiegel levert alleen de lijst — geen einddatum, geen plan, geen opzegging.
  const subs = currentClient.calls.find((c) => c.table === 'school_subscriptions');
  assert.deepEqual(subs.ops.find((o) => o[0] === 'eq'), ['eq', 'stripe_status', 'trialing']);
  assert.deepEqual(subs.ops.find((o) => o[0] === 'select'), ['select', 'school_id, stripe_subscription_id']);
  // De feiten zijn bij Stripe opgevraagd, voor precies dit abonnement.
  assert.deepEqual(stripeCalls, ['sub_1']);
});

test('R3: al verstuurd (dubbele cron-run) → geen tweede mail', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub({ dagen: 1 }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-mandaat', 'sub_1')], error: null }],
    drivingschools: [{ data: { id: 's-mandaat', name: 'Rijschool Voorbeeld', email: 'info@voorbeeld.nl' }, error: null }],
    billing_events: [{ data: [{ created_at: new Date(Date.now() - 60_000).toISOString() }], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 0);
  assert.deepEqual(res.body.skipped, [{ schoolId: 's-mandaat', reason: 'already_sent' }]);

  // De controle kijkt naar precies deze mailsoort voor precies deze school.
  const dedup = currentClient.calls.find((c) => c.table === 'billing_events');
  const eqs = dedup.ops.filter((o) => o[0] === 'eq').map((o) => o.slice(1));
  assert.deepEqual(eqs, [
    ['school_id', 's-mandaat'],
    ['event_type', 'email_sent'],
    ['email_type', 'free_period_ending_1d'],
  ]);
});

test('R4: kan de route niet nagaan of de mail al is verstuurd → niet versturen', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub() };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-mandaat', 'sub_1')], error: null }],
    drivingschools: [{ data: { id: 's-mandaat', name: 'Rijschool Voorbeeld', email: 'info@voorbeeld.nl' }, error: null }],
    billing_events: [{ data: null, error: { message: 'db kapot' } }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 0);
  assert.deepEqual(res.body.failed, [{ school_id: 's-mandaat', days: 7, reason: 'dedup check failed' }]);
});

test('R5: opgezegd abonnement → geen mail, wel zichtbaar als overgeslagen', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub({ opgezegd: true }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-opgezegd', 'sub_1')], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 0);
  assert.deepEqual(res.body.skipped, [{ schoolId: 's-opgezegd', reason: 'cancellation_scheduled' }]);
  // Geen schoolgegevens opgehaald voor een school die geen mail krijgt.
  assert.equal(currentClient.calls.some((c) => c.table === 'drivingschools'), false);
});

test('R6: school zonder e-mailadres → gemeld als mislukt, geen crash', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub({ plan: 'basic' }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-leeg', 'sub_1')], error: null }],
    drivingschools: [{ data: { id: 's-leeg', name: 'Zonder mail', email: null }, error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 0);
  assert.deepEqual(res.body.failed, [{ school_id: 's-leeg', days: 7, reason: 'no email' }]);
});

test('R7: de oude proefmail werkt zoals hij deed — school zonder abonnement krijgt "kies een abonnement"', async () => {
  reset();
  currentClient = makeClient({
    instructor_licenses: [
      { data: [{ id: 'lic-1', school_id: 's-oud', trial_ends_at: overDagen(7) }], error: null },
      { data: [], error: null },
    ],
    drivingschools: [{ data: { id: 's-oud', name: 'Oude Proef', email: 'oud@voorbeeld.nl' }, error: null }],
    school_subscriptions: [{ data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.deepEqual(trialMails, [['s-oud', 'oud@voorbeeld.nl', 'Oude Proef', 7]]);
  assert.equal(freePeriodMails.length, 0);
  assert.deepEqual(res.body.sent, [{ school_id: 's-oud', days: 7, email: 'oud@voorbeeld.nl' }]);

  // De oude selectie is niet aangeraakt: nog steeds actieve licenties in proef.
  const eerste = currentClient.calls[0];
  assert.equal(eerste.table, 'instructor_licenses');
  assert.deepEqual(eerste.ops.filter((o) => o[0] === 'eq').map((o) => o.slice(1)), [['status', 'active'], ['is_trial', true]]);
});

test('R8: faalt de nieuwe selectie, dan zijn de oude mails al verstuurd', async () => {
  reset();
  currentClient = makeClient({
    instructor_licenses: [
      { data: [{ id: 'lic-1', school_id: 's-oud', trial_ends_at: overDagen(7) }], error: null },
      { data: [], error: null },
    ],
    drivingschools: [{ data: { id: 's-oud', name: 'Oude Proef', email: 'oud@voorbeeld.nl' }, error: null }],
    school_subscriptions: [{ data: null, error: { message: 'tabel onbereikbaar' } }],
  });

  const res = await GET(verzoek());

  assert.equal(res.status, 200);
  assert.equal(trialMails.length, 1);
  assert.equal(freePeriodMails.length, 0);
});

test('R9: gooit het versturen een fout, dan komt de school in "failed" en gaat de run door', async () => {
  reset();
  freePeriodMailFout = new Error('resend plat');
  stripeSubs = { sub_a: stripeSub({ plan: 'basic' }), sub_b: stripeSub({ plan: 'premium' }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-a', 'sub_a'), spiegel('s-b', 'sub_b')], error: null }],
    drivingschools: [
      { data: { id: 's-a', name: 'A', email: 'a@voorbeeld.nl' }, error: null },
      { data: { id: 's-b', name: 'B', email: 'b@voorbeeld.nl' }, error: null },
    ],
    billing_events: [{ data: [], error: null }, { data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.failed.map((f) => f.school_id), ['s-a', 's-b']);
  assert.equal(res.body.sent.length, 0);
});

test('R10: de spiegel heeft geen einddatum (zoals na elke inschrijving) → Stripe geeft hem, de mail gaat uit', async () => {
  // Het geval waarvoor de feiten uit Stripe komen. Gemeten 2 okt 2026:
  // Drive4License stond trialing met current_period_end NULL in de spiegel.
  reset();
  stripeSubs = { sub_d4l: stripeSub({ plan: 'premium', dagen: 7 }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-d4l', 'sub_d4l')], error: null }],
    drivingschools: [{ data: { id: 's-d4l', name: 'Rijschool Zonder Einddatum', email: 'd4l@voorbeeld.nl' }, error: null }],
    billing_events: [{ data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 1);
  assert.equal(freePeriodMails[0][2].plan, 'premium');
  assert.equal(freePeriodMails[0][2].daysLeft, 7);
  assert.deepEqual(res.body.skipped, []);
});

test('R11: Stripe zegt dat de gratis periode al voorbij is → geen mail, ook al staat de spiegel nog op trialing', async () => {
  reset();
  stripeSubs = { sub_1: stripeSub({ status: 'active', dagen: 7 }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-mandaat', 'sub_1')], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(freePeriodMails.length, 0);
  assert.equal(res.body.sent_count, 0);
});

test('R12: Stripe onbereikbaar voor één school → die school in "failed", de andere krijgt gewoon zijn mail', async () => {
  reset();
  stripeSubs = { sub_kapot: new Error('stripe timeout'), sub_goed: stripeSub({ plan: 'basic' }) };
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [spiegel('s-kapot', 'sub_kapot'), spiegel('s-goed', 'sub_goed')], error: null }],
    drivingschools: [{ data: { id: 's-goed', name: 'Goed', email: 'goed@voorbeeld.nl' }, error: null }],
    billing_events: [{ data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.sent.map((x) => x.school_id), ['s-goed']);
  assert.equal(res.body.failed.length, 1);
  assert.equal(res.body.failed[0].school_id, 's-kapot');
  assert.match(res.body.failed[0].reason, /^stripe lookup failed/);
});

test('R13: geen enkele school in de gratis periode → Stripe wordt niet aangeroepen', async () => {
  reset();
  currentClient = makeClient({
    instructor_licenses: GEEN_LICENTIES,
    school_subscriptions: [{ data: [], error: null }],
  });

  const res = await GET(verzoek());

  assert.equal(res.status, 200);
  assert.deepEqual(stripeCalls, []);
  assert.deepEqual(res.body, { sent_count: 0, failed_count: 0, skipped_count: 0, sent: [], failed: [], skipped: [] });
});
