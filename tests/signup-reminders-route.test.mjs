// Routetest voor app/api/cron/signup-reminders/route.ts (spoor 1b).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.CRON_SECRET = 'cron-geheim';
process.env.RESEND_API_KEY = 'test-resend';

let rijen = [];
let updates = [];
let resendMails = [];
let resendKapot = false;
let teamMeldingen = [];

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from(table) {
        const q = {
          select() { return q; },
          eq() { return q; },
          gte() { return q; },
          then: (r) => r({ data: table === 'pending_registrations' ? rijen : [], error: null }),
          update(payload) {
            const u = { payload, filters: [] };
            updates.push(u);
            const chain = {
              eq(c, v) { u.filters.push([c, v]); return chain; },
              then: (r) => r({ error: null }),
            };
            return chain;
          },
        };
        return q;
      },
    }),
  },
});
mock.module('@/lib/admin-notifications', {
  namedExports: {
    sendAdminNotification: async (type, info) => { teamMeldingen.push({ type, info }); },
  },
});

globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    if (resendKapot) return { ok: false, status: 500, text: async () => 'kapot' };
    resendMails.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ id: 're_1' }), text: async () => '' };
  }
  throw new Error(`onverwachte fetch: ${url}`);
};

const { GET } = await import('../app/api/cron/signup-reminders/route.ts');

const verzoek = (secret = 'cron-geheim') => ({
  headers: { get: (h) => (h === 'authorization' && secret ? `Bearer ${secret}` : null) },
});
const urenGeleden = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const rij = (over = {}) => ({
  id: 'pend-1', status: 'pending_checkout', school_name: 'Rijschool Marok', first_name: 'Mareas',
  last_name: 'Pinoras', email: 'school@voorbeeld.test', phone: '0644287534', city: 'Naaldwijk',
  plan: 'premium', promo_code: null, created_at: urenGeleden(30), reminder_sent_at: null,
  followup_notified_at: null, signup_attribution: null, ...over,
});
function reset() { rijen = []; updates = []; resendMails = []; resendKapot = false; teamMeldingen = []; }

test('R1: zonder of met verkeerd cron-geheim → 401 en niets verstuurd', async () => {
  reset(); rijen = [rij()];
  for (const s of [null, 'fout']) {
    const res = await GET(verzoek(s));
    assert.equal(res.status, 401);
  }
  assert.equal(resendMails.length, 0);
  assert.equal(updates.length, 0);
});

test('R2: 30 uur oud → herinnering aan de school, reminder_sent_at gezet, geen teammelding', async () => {
  reset(); rijen = [rij()];
  const res = await GET(verzoek());
  assert.equal(res.status, 200);
  assert.equal(res.body.herinnerd_count, 1);
  assert.equal(res.body.gemeld_count, 0);
  assert.equal(resendMails.length, 1);
  assert.equal(resendMails[0].to, 'school@voorbeeld.test');
  assert.match(resendMails[0].subject, /staat nog open/);
  assert.equal(updates.length, 1);
  assert.ok(updates[0].payload.reminder_sent_at);
  assert.deepEqual(updates[0].filters, [['id', 'pend-1'], ['status', 'pending_checkout']]);
});

test('R3: 50 uur oud, herinnering gisteren al → alleen teammelding met de stand van de herinnering', async () => {
  reset(); rijen = [rij({ created_at: urenGeleden(50), reminder_sent_at: urenGeleden(26) })];
  const res = await GET(verzoek());
  assert.equal(res.body.herinnerd_count, 0);
  assert.equal(res.body.gemeld_count, 1);
  assert.equal(resendMails.length, 0, 'geen tweede herinnering aan de school');
  assert.equal(teamMeldingen.length, 1);
  assert.equal(teamMeldingen[0].type, 'signup_abandoned');
  assert.equal(teamMeldingen[0].info.extra.Telefoon, '0644287534');
  assert.match(teamMeldingen[0].info.extra.Herinnering, /verstuurd op/);
  assert.ok(updates[0].payload.followup_notified_at);
});

test('R4: 50 uur oud, nog niets verstuurd → beide in één run, teammelding weet van de zojuist verstuurde herinnering', async () => {
  reset(); rijen = [rij({ created_at: urenGeleden(50) })];
  const res = await GET(verzoek());
  assert.equal(res.body.herinnerd_count, 1);
  assert.equal(res.body.gemeld_count, 1);
  assert.match(teamMeldingen[0].info.extra.Herinnering, /verstuurd op/);
  assert.equal(updates.length, 2);
});

test('R5: Resend faalt → geen kolom gezet, zodat het morgen opnieuw geprobeerd wordt; route blijft 200', async () => {
  reset(); rijen = [rij()]; resendKapot = true;
  const res = await GET(verzoek());
  assert.equal(res.status, 200);
  assert.equal(res.body.herinnerd_count, 0);
  assert.equal(res.body.mislukt_count, 1);
  assert.equal(res.body.mislukt[0].stap, 'herinnering');
  assert.equal(updates.length, 0);
});

test('R6: niets te doen → lege run', async () => {
  reset(); rijen = [rij({ created_at: urenGeleden(2) }), rij({ id: 'pend-2', status: 'activated', created_at: urenGeleden(60) })];
  const res = await GET(verzoek());
  assert.equal(res.body.bekeken, 2);
  assert.equal(res.body.herinnerd_count, 0);
  assert.equal(res.body.gemeld_count, 0);
  assert.equal(updates.length, 0);
});
