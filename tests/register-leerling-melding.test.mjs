// POST /api/register — melding aan het team bij een leerling die zich via de
// website inschrijft (16 nov 2026). Zonder contactgegevens van de leerling:
// die horen bij de rijschool. Zelfde nagebootste database als de SEC003-test.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.RESEND_API_KEY = 'test-resend';
process.env.ADMIN_NOTIFICATION_EMAIL = 'team@test.ribba';

let bestaand = null;
const mails = [];

function query(table) {
  const q = {
    select() { return q; },
    eq() { return q; },
    is() { return q; },
    limit: async () => ({ data: table === 'students' && bestaand ? [bestaand] : [], error: null }),
    single: async () => ({ data: { name: 'Rijschool Test', email: 'school@x.test' }, error: null }),
    update() {
      const chain = { eq() { return chain; }, is: async () => ({ error: null }), then: (r) => r({ error: null }) };
      return chain;
    },
    insert() {
      return { select: () => ({ single: async () => ({ data: { id: 'nieuw-1', mag_proefles_plannen: false, user_id: null }, error: null }) }) };
    },
  };
  return q;
}

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ from: query }) } });
mock.module('@/lib/rate-limit', { namedExports: { rateLimit: () => true } });
mock.module('@/lib/referral-attribution', { namedExports: { recordReferralAttribution: async () => {} } });

globalThis.fetch = async (_url, init) => {
  mails.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ id: 're_1' }), text: async () => '' };
};

const { POST } = await import('../app/api/register/route.ts');

const formulier = {
  first_name: 'Eva', last_name: 'Jansen', email: 'eva@x.test', phone: '+31600000000',
  address: 'Nepstraat 1', postal_code: '1234AB', city: 'Nergens', license_type: 'B',
  date_of_birth: '2000-01-01', drivingschool_id: 'school-1',
};
const verzoek = (body) => ({ headers: { get: () => '203.0.113.9' }, json: async () => body });

beforeEach(() => { bestaand = null; mails.length = 0; });

test('nieuwe leerling via de website: school, leerling én team krijgen mail', async () => {
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);

  const team = mails.filter((m) => m.to === 'team@test.ribba');
  assert.equal(team.length, 1, 'precies één teammelding');
  assert.equal(team[0].subject, 'Nieuwe leerling aangemeld: Rijschool Test');
  assert.match(team[0].html, /Eva Jansen/);
  assert.match(team[0].html, /Nergens/);
  assert.match(team[0].html, /Wachtlijst/);
  assert.match(team[0].html, /nieuw aangemaakt/);
  assert.doesNotMatch(team[0].html, /eva@x\.test/, 'geen e-mailadres van de leerling naar het team');
  assert.doesNotMatch(team[0].html, /\+31600000000/, 'geen telefoonnummer van de leerling naar het team');

  assert.ok(mails.some((m) => m.to === 'school@x.test'), 'de school krijgt nog steeds haar melding');
});

test('bestaande leerlingrij aangevuld: melding zegt dat', async () => {
  bestaand = {
    id: 'stud-1', user_id: null, status: 'active', first_name: 'Eva', last_name: 'Jansen',
    phone: '+31600000000', address: 'Nepstraat 1', postal_code: '1234AB', city: 'Nergens',
    license_type: 'B', date_of_birth: '2000-01-01',
  };
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  const team = mails.find((m) => m.to === 'team@test.ribba');
  assert.match(team.html, /bestaande leerlingrij aangevuld/);
  assert.match(team.html, /Actief/);
});
