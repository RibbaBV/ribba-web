// GET /api/signup/offer — maandelijks of jaarlijks (J2) en de J3-poort.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = 'sk_test_x';

let prices = {};
const promoCodes = {
  STARTGRATIS: { id: 'promo_test', code: 'STARTGRATIS', active: true, promotion: { type: 'coupon', coupon: 'coupon_test' } },
};
const coupons = {
  coupon_test: { id: 'coupon_test', valid: true, percent_off: 100, amount_off: null, duration: 'repeating', duration_in_months: 6, currency: null },
};

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@/lib/stripe', {
  namedExports: {
    getStripe: () => ({
      prices: { list: async ({ lookup_keys }) => ({ data: prices[lookup_keys[0]] ? [prices[lookup_keys[0]]] : [] }) },
      promotionCodes: { list: async ({ code }) => ({ data: promoCodes[code] ? [promoCodes[code]] : [] }) },
      coupons: { retrieve: async (id) => { if (!coupons[id]) throw new Error('geen'); return coupons[id]; } },
    }),
  },
});

const { GET } = await import('../app/api/signup/offer/route.ts');

function reset() {
  prices = {
    premium_standaard: {
      id: 'price_premium', active: true, currency: 'eur', recurring: { interval: 'month' },
      unit_amount: 4500, tax_behavior: 'exclusive', metadata: { plan: 'premium', trial_interval: '1 month' },
    },
    premium_jaar: {
      id: 'price_premium_jaar', active: true, currency: 'eur', recurring: { interval: 'year' },
      unit_amount: 54000, tax_behavior: 'exclusive', metadata: { plan: 'premium', trial_interval: '1 month' },
    },
  };
}
const verzoek = (params = {}) => ({ nextUrl: { searchParams: new URLSearchParams(params) } });

test('zonder interval: het maandaanbod', async () => {
  reset();
  const res = await GET(verzoek());
  assert.equal(res.body.beschikbaar, true);
  assert.equal(res.body.interval, 'maand');
  assert.equal(res.body.bedragen.nettoCenten, 4500);
});

test('interval=jaar: het jaaraanbod, met de gratis eerste maand', async () => {
  reset();
  const res = await GET(verzoek({ interval: 'jaar' }));
  assert.equal(res.body.beschikbaar, true);
  assert.equal(res.body.interval, 'jaar');
  assert.equal(res.body.bedragen.nettoCenten, 54000);
  assert.equal(res.body.trial.tekst, '1 maand gratis');
});

test('een onbekend interval → 400', async () => {
  reset();
  const res = await GET(verzoek({ interval: 'week' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.beschikbaar, false);
});

test('J3: jaar + geaccepteerde code → 400 met Nederlandse uitleg', async () => {
  reset();
  const res = await GET(verzoek({ interval: 'jaar', code: 'STARTGRATIS' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.reden, 'jaar_met_korting');
  assert.match(res.body.error, /alleen te gebruiken bij maandelijks/);
});

test('maand + code: gewoon de actie', async () => {
  reset();
  const res = await GET(verzoek({ code: 'STARTGRATIS' }));
  assert.equal(res.body.beschikbaar, true);
  assert.equal(res.body.promoToegepast, 'STARTGRATIS');
});
