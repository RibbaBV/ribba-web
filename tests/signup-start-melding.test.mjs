// POST /api/signup/start — melding aan het team zodra een rijschool het
// formulier afrondt en naar Checkout gaat (16 nov 2026). Tot dan kwam de
// eerste melding pas ná de betaling, en wie bij Checkout afhaakte verdween
// stil. Draait de echte route met nagebootste database, Stripe en Resend.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.RESEND_API_KEY = 'test-resend';
process.env.ADMIN_NOTIFICATION_EMAIL = 'team@test.ribba';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';

let insertFaalt = false;
const inserts = [];
const sessies = [];
const mails = [];
let resendKapot = false;

function query(table) {
  const q = {
    select() { return q; },
    ilike() { return q; },
    neq() { return q; },
    eq() { return q; },
    maybeSingle: async () => {
      if (table === 'drivingschools') return { data: null, error: null };
      // hergebruik van een bestaande, nog niet afgeronde registratie
      return { data: { id: 'pend-oud', status: 'pending_checkout' }, error: null };
    },
    insert(payload) {
      inserts.push(payload);
      return {
        select: () => ({
          single: async () => insertFaalt
            ? { data: null, error: { code: '23505', message: 'duplicate' } }
            : { data: { id: 'pend-1' }, error: null },
        }),
      };
    },
    update() { return { eq: async () => ({ error: null }) }; },
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
mock.module('@/lib/signup-offer-deps', {
  namedExports: {
    maakOfferDeps: () => ({
      stripe: {
        checkout: {
          sessions: {
            create: async (args) => { sessies.push(args); return { id: 'cs_1', url: 'https://checkout.test/cs_1' }; },
          },
        },
      },
    }),
  },
});
mock.module('@/lib/signup-offer', {
  namedExports: {
    JAAR_MET_KORTING_MELDING: 'jaar met korting kan niet',
    resolveSignupOffer: async (_deps, _plan, opties) => ({
      ok: true,
      priceId: 'price_x',
      trial: opties?.promoCode ? null : { trialEndUnix: 1_900_000_000 },
      korting: opties?.promoCode === 'STARTGRATIS'
        ? { code: 'STARTGRATIS', promotionCodeId: 'promo_1' }
        : null,
    }),
  },
});
mock.module('@/lib/legal-acceptances', {
  namedExports: {
    extractIpAddress: () => '203.0.113.9',
    extractUserAgent: () => 'test-agent',
    pickAcceptedVersions: () => [
      { document_type: 'terms', document_version: '1' },
      { document_type: 'privacy', document_version: '1' },
      { document_type: 'dpa', document_version: '1' },
    ],
  },
});

globalThis.fetch = async (url, init) => {
  if (String(url).includes('api.resend.com')) {
    if (resendKapot) throw new Error('resend ligt plat');
    mails.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ id: 're_1' }), text: async () => '' };
  }
  throw new Error(`onverwachte fetch: ${url}`);
};

const { POST } = await import('../app/api/signup/start/route.ts');

const formulier = {
  legal_form: 'eenmanszaak', country_code: 'NL',
  school_name: 'Rijschool Marok', first_name: 'Mareas', last_name: 'Pinoras',
  email: 'test@voorbeeld.test', phone: '0644287534',
  address: 'Teststraat 1', postal_code: '2671 AB', city: 'Naaldwijk',
  kvk_number: '12345678',
  legal_acceptances: { terms: 'x', privacy: 'x', dpa: 'x' },
  attribution: { landing_page: '/registreren', referrer: 'https://ribba.nl/', utm_source: 'instantly', utm_campaign: 'nieuwe-rijscholen' },
};
const verzoek = (body) => ({ headers: { get: () => '203.0.113.9' }, json: async () => body });

beforeEach(() => {
  insertFaalt = false; resendKapot = false;
  inserts.length = 0; sessies.length = 0; mails.length = 0;
});

test('gestarte inschrijving: Checkout ontstaat én het team krijgt één mail met wie, waar en herkomst', async () => {
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(res.body.checkoutUrl, 'https://checkout.test/cs_1');
  assert.equal(sessies.length, 1);

  assert.equal(mails.length, 1, 'precies één melding');
  const m = mails[0];
  assert.equal(m.to, 'team@test.ribba');
  assert.equal(m.subject, 'Inschrijving gestart, nog niet betaald: Rijschool Marok');
  assert.match(m.html, /Naaldwijk/);
  assert.match(m.html, /Mareas Pinoras/);
  assert.match(m.html, /0644287534/, 'telefoonnummer, zodat er gebeld kan worden');
  assert.match(m.html, /maandelijks/);
  assert.match(m.html, /\/registreren/, 'landingspagina');
  assert.match(m.html, /https:\/\/ribba\.nl\//, 'verwijzer');
  assert.match(m.html, /instantly \/ nieuwe-rijscholen/, 'campagne uit utm');
  assert.match(m.html, /eerste poging/);
  assert.match(m.html, /24 uur geldig/);
  assert.doesNotMatch(m.html, /Kortingscode/, 'geen code gebruikt, dus geen regel');
});

test('hergebruikte registratie (tweede keer op Betalen): melding zegt "opnieuw gestart"', async () => {
  insertFaalt = true;
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(res.body.pendingRegistrationId, 'pend-oud');
  assert.equal(mails.length, 1);
  assert.match(mails[0].html, /opnieuw gestart/);
});

test('met kortingscode en jaarbetaling: beide staan in de melding', async () => {
  const res = await POST(verzoek({ ...formulier, promo_code: 'STARTGRATIS', interval: 'jaar' }));
  assert.equal(res.status, 200);
  assert.match(mails[0].html, /STARTGRATIS/);
  assert.match(mails[0].html, /jaarlijks/);
});

test('mailprovider plat: de inschrijving gaat gewoon door', async () => {
  resendKapot = true;
  const res = await POST(verzoek(formulier));
  assert.equal(res.status, 200);
  assert.equal(res.body.checkoutUrl, 'https://checkout.test/cs_1');
  assert.equal(mails.length, 0);
});

test('ongeldig formulier: geen Checkout en geen melding', async () => {
  const res = await POST(verzoek({ ...formulier, kvk_number: '123' }));
  assert.equal(res.status, 400);
  assert.equal(sessies.length, 0);
  assert.equal(mails.length, 0);
});
