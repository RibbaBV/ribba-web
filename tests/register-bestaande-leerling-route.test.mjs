// SEC003 — gedrag van POST /api/register bij een leerlingrij die de rijschool
// al had aangemaakt. Draait de echte route met een nagebootste database.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.RESEND_API_KEY = 'test-resend';

let bestaand = null;
const updates = [];
const inserts = [];
const mails = [];

function query(table) {
  const q = {
    _filters: [],
    select() { return q; },
    eq(c, v) { q._filters.push(['eq', c, v]); return q; },
    is(c, v) { q._filters.push(['is', c, v]); return q; },
    limit: async () => ({ data: table === 'students' && bestaand ? [bestaand] : [], error: null }),
    single: async () => ({ data: { name: 'Rijschool Test', email: 'school@x.test' }, error: null }),
    update(payload) {
      const u = { payload, filters: q._filters };
      updates.push(u);
      const chain = {
        eq(c, v) { u.filters.push(['eq', c, v]); return chain; },
        is(c, v) { u.filters.push(['is', c, v]); return Promise.resolve({ error: null }); },
        then: (r) => r({ error: null }),
      };
      return chain;
    },
    insert(payload) {
      inserts.push(payload);
      return { select: () => ({ single: async () => ({ data: { id: 'nieuw-1' }, error: null }) }) };
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
  return { ok: true };
};

const { POST } = await import('../app/api/register/route.ts');

const formulier = {
  first_name: 'Eva', last_name: 'Aanvaller', email: 'lisa@x.test', phone: '+31600000000',
  address: 'Nepstraat 1', postal_code: '1234AB', city: 'Nergens', license_type: 'B',
  date_of_birth: '2000-01-01', drivingschool_id: 'school-1',
};
const verzoek = (body) => ({ headers: { get: () => '203.0.113.9' }, json: async () => body });

beforeEach(() => { bestaand = null; updates.length = 0; inserts.length = 0; mails.length = 0; });

test('volledig ingevulde, actieve leerling: niets wordt overschreven, status blijft', async () => {
  bestaand = {
    id: 'stud-1', user_id: null, status: 'active', first_name: 'Lisa', last_name: 'de Vries',
    phone: '+31611111111', address: 'Echte straat 5', postal_code: '3011AA', city: 'Rotterdam',
    license_type: 'B', date_of_birth: '2006-05-05',
  };
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(updates.length, 0, 'geen enkele update op de bestaande rij');
  assert.equal(inserts.length, 0);
  const schoolMail = mails.find((m) => m.to === 'school@x.test');
  assert.match(schoolMail.html, /Status:<\/strong> Actief/);
  assert.match(schoolMail.html, /niet overgenomen/);
  assert.match(schoolMail.html, /bij jou Lisa, ingevuld Eva/);
});

test('rij met alleen naam: lege velden worden aangevuld, zonder status', async () => {
  bestaand = { id: 'stud-2', user_id: null, status: 'active', first_name: 'Eva', last_name: 'Aanvaller', license_type: 'B' };
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(updates.length, 1);
  const { payload, filters } = updates[0];
  assert.deepEqual(Object.keys(payload).sort(), ['address', 'city', 'date_of_birth', 'phone', 'postal_code']);
  assert.equal('status' in payload, false);
  assert.deepEqual(filters, [['eq', 'id', 'stud-2'], ['is', 'user_id', null]]);
});

test('nieuwe leerling: wordt zoals voorheen op de wachtlijst aangemaakt', async () => {
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].status, 'waitlist');
  assert.equal(inserts[0].first_name, 'Eva');
  const schoolMail = mails.find((m) => m.to === 'school@x.test');
  assert.match(schoolMail.html, /Status:<\/strong> Wachtlijst/);
  assert.match(schoolMail.html, /nieuwe leerling aangemeld/);
});

test('leerling met account: blijft 409, niets bijgewerkt', async () => {
  bestaand = { id: 'stud-3', user_id: 'user-1', status: 'active', first_name: 'Lisa' };
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 409);
  assert.equal(updates.length, 0);
  assert.equal(mails.length, 0);
});
