import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isProfile, validateProfileChanges, validSupportIban } from '../lib/support-school-profile.ts';

const profile = { name: 'Testschool', email: 'test@example.com', phone: '0612345678', address: 'Teststraat 1', postal_code: '1234 AB', city: 'Amsterdam', kvk_number: '12345678', btw_number: null, iban: null, legal_name: null, billing_address: null, billing_postal_code: null, billing_city: null, country_code: 'NL', legal_form: 'eenmanszaak' };
test('normaliseert gewijzigde contact- en bankgegevens', () => {
  assert.deepEqual(validateProfileChanges(profile, { email: ' SUPPORT@EXAMPLE.COM ', iban: 'nl91 abna 0417 1643 00' }).changes, { email: 'support@example.com', iban: 'NL91ABNA0417164300' });
  assert.equal(validSupportIban('NL90ABNA0417164300'), false);
  assert.ok(validateProfileChanges(profile, { iban: 'NL90ABNA0417164300' }).error);
});
test('alleen gewijzigde velden valideren; legacydata blijft behouden', () => {
  assert.deepEqual(validateProfileChanges({ ...profile, phone: 'oud onbekend' }, { name: 'Nieuwe naam' }), { changes: { name: 'Nieuwe naam' } });
  assert.deepEqual(validateProfileChanges(profile, { name: ' Testschool ' }), { changes: {} });
});
test('beschermde velden, lege verplichte waarden en verkeerde typen weigeren', () => {
  for (const changes of [{ country_code: 'BE' }, { legal_form: 'bv' }, { name: '' }, { email: 'ongeldig' }, { phone: 123 }, { name: 'x\nY' }, { name: 'x'.repeat(321) }, []]) assert.ok(validateProfileChanges(profile, changes).error);
  assert.equal(isProfile(profile), true);
  assert.equal(isProfile({ ...profile, extra: 'x' }), false);
  assert.equal(isProfile({ name: 'x' }), false);
});
test('vestigingsadres moet compleet zijn en bij BV horen', () => {
  const bv = { ...profile, legal_form: 'bv', legal_name: 'Test BV' };
  assert.ok(validateProfileChanges(bv, { billing_address: 'Straat 2' }).error);
  assert.ok(validateProfileChanges(bv, { legal_name: '' }).error);
  const billing = { billing_address: 'Straat 2', billing_postal_code: '2345 cd', billing_city: 'Utrecht' };
  assert.equal(validateProfileChanges(bv, billing).changes.billing_postal_code, '2345CD');
  assert.ok(validateProfileChanges(profile, billing).error);
});

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
let client;
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => client } });
mock.module('next/server', { namedExports: { NextRequest: class {}, NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, headers: new Headers(init?.headers) }) } } });
const { GET, PATCH } = await import('../app/api/support/schools/[id]/profile/route.ts');
const id = '00000000-0000-0000-0000-000000000002';
const ctx = { params: Promise.resolve({ id }) };
const jwt = (aal = 'aal2', age = 0) => `h.${Buffer.from(JSON.stringify({ aal, amr: [{ method: 'totp', timestamp: Math.floor(Date.now()/1000) - age }] })).toString('base64url')}.s`;
const request = (body, bearer = jwt()) => ({ headers: new Headers(bearer ? { authorization: `Bearer ${bearer}` } : {}), text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function setup({ staff = true, logError = null, result = { status: 'saved', profile }, rpcError = null, current = profile } = {}) {
  const calls = [];
  client = {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: 'verified-actor', email: 'owner@example.com' } }, error: null }) },
    from: () => ({ insert: async () => ({ error: logError }) }),
    rpc: async (name, args) => { calls.push({ name, args }); return name === 'is_platform_staff' ? { data: staff } : name === 'support_school_profile' ? { data: current } : { data: result, error: rpcError }; },
  };
}
const writes = () => client.calls.filter(c => c.name === 'support_update_school_profile');
test('PATCH gebruikt geverifieerde actor en genormaliseerde gegevens', async () => {
  setup();
  const res = await PATCH(request({ expected: profile, changes: { iban: 'nl91 abna 0417 1643 00' }, actor_id: 'spoofed' }), ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control').includes('no-store'), true);
  assert.deepEqual(writes()[0].args, { p_school_id: id, p_actor_id: 'verified-actor', p_expected: profile, p_changes: { iban: 'NL91ABNA0417164300' } });
});
test('zonder toegang of auditregistratie wordt niets gewijzigd', async () => {
  for (const [opts, bearer, status] of [[{}, null, 401], [{}, jwt('aal1'), 403], [{}, jwt('aal2', 9*3600), 403], [{ staff: false }, jwt(), 403], [{ logError: { message: 'offline' } }, jwt(), 503]]) {
    setup(opts);
    const res = await PATCH(request({ expected: profile, changes: { name: 'Nieuw' } }, bearer), ctx);
    assert.equal(res.status, status);
    assert.equal(writes().length, 0);
  }
});
test('ongeldige invoer bereikt de schrijf-RPC niet', async () => {
  for (const body of ['{', 'x'.repeat(20001), { changes: { name: 'Nieuw' } }, { expected: profile, changes: { country_code: 'BE' } }, { expected: profile, changes: { iban: 'NL90ABNA0417164300' } }]) {
    setup(); const res = await PATCH(request(body), ctx);
    assert.ok([400, 413].includes(res.status)); assert.equal(writes().length, 0);
  }
});
test('conflict, ontbrekende school en databasefout zijn herkenbaar zonder interne details', async () => {
  for (const [opts, status] of [[{ result: { status: 'conflict' } }, 409], [{ current: null }, 404], [{ rpcError: { message: 'secret database detail' } }, 500]]) {
    setup(opts); const res = await PATCH(request({ expected: profile, changes: { name: 'Nieuw' } }), ctx);
    assert.equal(res.status, status); assert.ok(!JSON.stringify(res.body).includes('secret database'));
  }
});
test('GET leest profiel via beperkte RPC; ongeldig school-ID wordt geweigerd', async () => {
  setup(); assert.deepEqual((await GET(request(null), ctx)).body, { profile });
  setup(); assert.equal((await GET(request(null), { params: Promise.resolve({ id: 'geen-uuid' }) })).status, 400);
  assert.equal(client.calls.some(c => c.name === 'support_school_profile'), false);
});
