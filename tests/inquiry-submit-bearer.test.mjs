// inquiry-submit — de app als tweede afzender (F2-4a).
//
// Wat hier wordt vastgepind:
//   1. zonder bearer verandert er niets: e-mail uit de body, rate-limit per IP,
//      source_page uit de body, geen koppeling aan een account;
//   2. met een geldige bearer wint het account-e-mailadres, is de rate-limit
//      per gebruiker, wordt source_page 'app' en wordt inquiries.leerling_user_id
//      gezet ná de RPC — vóór de response;
//   3. een ongeldige bearer is 401, nog vóór de body wordt gelezen;
//   4. een 409 (24u-dedupe) koppelt niets.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const rpcCalls = [];
const updates = []; // { table, payload, eq }
const rateKeys = [];
let rpcResult = { inquiry_id: 'inq-1', recipients: [{ id: 'rec-1', rijschool_id: 5953, rijschool_chat_token: 't' }] };
let getUserResult = { data: { user: { id: 'user-1', email: 'Fleur@Example.com ' } }, error: null };

const fakeSupabase = {
  auth: { getUser: async () => getUserResult },
  rpc: async (fn, args) => {
    rpcCalls.push({ fn, args });
    return { data: rpcResult, error: null };
  },
  from(table) {
    return {
      update: (payload) => ({
        eq: async (col, val) => {
          updates.push({ table, payload, eq: [col, val] });
          return { error: null };
        },
      }),
    };
  },
};

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
    after: () => {}, // mails buiten scope van deze test
  },
});
mock.module('@/lib/rate-limit', {
  namedExports: {
    rateLimit: (key) => {
      rateKeys.push(key);
      return true;
    },
  },
});
mock.module('@/lib/cors', { namedExports: { corsHeaders: () => ({}), corsPreflight: () => null } });
mock.module('@/lib/marketplace-db', {
  namedExports: {
    getServiceClient: () => fakeSupabase,
    getCbrRijscholen: async (ids) => ids.map((id) => ({ id, name: `School ${id}`, email: 'school@example.com' })),
  },
});
mock.module('@/lib/marketplace-emails', {
  namedExports: { sendRijschoolOutreachMail: async () => true, sendLeerlingBevestigingMail: async () => true },
});

const { POST } = await import('../app/api/inquiry-submit/route.ts');

function reset() {
  rpcCalls.length = 0;
  updates.length = 0;
  rateKeys.length = 0;
  rpcResult = { inquiry_id: 'inq-1', recipients: [{ id: 'rec-1', rijschool_id: 5953, rijschool_chat_token: 't' }] };
  getUserResult = { data: { user: { id: 'user-1', email: 'Fleur@Example.com ' } }, error: null };
}

function makeRequest({ bearer, body = {} } = {}) {
  const headers = { authorization: bearer, 'x-forwarded-for': '203.0.113.7' };
  let bodyGelezen = false;
  return {
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => {
      bodyGelezen = true;
      return {
        leerling_name: 'Fleur Willems',
        leerling_email: 'client@example.com',
        rijbewijs_categorie: 'B',
        toestemming: true,
        rijschool_ids: [5953],
        source_page: 'https://ribba.app/rijscholen/5953',
        ...body,
      };
    },
    bodyGelezen: () => bodyGelezen,
  };
}

test('zonder bearer: gedrag van de site — e-mail uit de body, rate-limit per IP, geen koppeling', async () => {
  reset();
  const res = await POST(makeRequest());
  assert.equal(res.status, 201);
  assert.deepEqual(rateKeys, ['inquiry:203.0.113.7']);
  assert.equal(rpcCalls[0].args.p_leerling.leerling_email, 'client@example.com');
  assert.equal(rpcCalls[0].args.p_leerling.source_page, 'https://ribba.app/rijscholen/5953');
  assert.equal(updates.length, 0);
});

test('met geldige bearer: account-e-mail wint, rate-limit per gebruiker, source app, leerling_user_id gezet', async () => {
  reset();
  const res = await POST(makeRequest({ bearer: 'Bearer geldig-token' }));
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { inquiry_id: 'inq-1', recipients_count: 1 });
  assert.deepEqual(rateKeys, ['inquiry:user:user-1']);
  // Genormaliseerd: lowercase en getrimd — zo vergelijkt claim_inquiry ook.
  assert.equal(rpcCalls[0].args.p_leerling.leerling_email, 'fleur@example.com');
  assert.equal(rpcCalls[0].args.p_leerling.source_page, 'app');
  assert.deepEqual(updates, [
    { table: 'inquiries', payload: { leerling_user_id: 'user-1' }, eq: ['id', 'inq-1'] },
  ]);
});

test('ongeldige bearer: 401, en de body wordt niet eens gelezen', async () => {
  reset();
  getUserResult = { data: { user: null }, error: { message: 'invalid JWT' } };
  const req = makeRequest({ bearer: 'Bearer kapot' });
  const res = await POST(req);
  assert.equal(res.status, 401);
  assert.equal(req.bodyGelezen(), false);
  assert.equal(rpcCalls.length, 0);
  assert.equal(rateKeys.length, 0);
});

test('lege bearer-waarde telt als ongeldig, niet als afwezig', async () => {
  reset();
  const res = await POST(makeRequest({ bearer: 'Bearer ' }));
  assert.equal(res.status, 401);
});

test('409 door de 24u-dedupe koppelt niets aan het account', async () => {
  reset();
  rpcResult = { inquiry_id: null, recipients: [] };
  const res = await POST(makeRequest({ bearer: 'Bearer geldig-token' }));
  assert.equal(res.status, 409);
  assert.equal(updates.length, 0);
});
