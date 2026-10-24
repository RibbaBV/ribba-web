import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSchoolOwners } from '../lib/support-school-owner.ts';

function client({ permission = true, permissionError = null, metadata = { first_name: ' Ada ', last_name: ' Lovelace ' }, profile = null, registration = null, registrationError = null, authError = null, owners = [{ user_id: 'u1' }] } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => { calls.push([name, args]); return { data: permission, error: permissionError }; },
    auth: { admin: { getUserById: async id => {
      calls.push(['auth', id]);
      return { data: { user: { id, user_metadata: metadata, email: 'private@example.com' } }, error: authError };
    } } },
    from(table) {
      calls.push(table);
      return {
        select(fields) { calls.push(fields); return this; },
        eq(key, value) {
          calls.push([key, value]);
          return key === 'school_role' ? Promise.resolve({ data: owners, error: null }) : this;
        },
        maybeSingle: async () => table === 'pending_registrations'
          ? { data: registration, error: registrationError }
          : { data: profile, error: null },
      };
    },
  };
}

test('non-owner, ambiguous permission and permission error never query names', async () => {
  for (const options of [{ permission: false }, { permission: null }, { permission: 'true' }, { permissionError: Error('offline') }]) {
    const db = client(options);
    assert.equal(await readSchoolOwners(db, 'viewer', 'school'), null);
    assert.equal(db.calls.length, 1);
  }
});

test('uses registration/Auth name for exact school owner membership, no public profile required', async () => {
  const db = client();
  assert.deepEqual(await readSchoolOwners(db, 'viewer', 'school'), { status: 'ready', names: ['Ada Lovelace'] });
  assert.deepEqual(db.calls[0], ['is_platform_owner', { p_user_id: 'viewer' }]);
  assert.ok(db.calls.some(c => Array.isArray(c) && c[0] === 'drivingschool_id' && c[1] === 'school'));
  assert.ok(db.calls.some(c => Array.isArray(c) && c[0] === 'school_role' && c[1] === 'owner'));
  assert.ok(db.calls.some(c => Array.isArray(c) && c[0] === 'auth' && c[1] === 'u1'));
  assert.ok(!db.calls.includes('users'));
});

test('current Auth name takes priority over a stale public profile', async () => {
  assert.deepEqual(await readSchoolOwners(client({ profile: { name: 'Old name' } }), 'v', 's'), { status: 'ready', names: ['Ada Lovelace'] });
});

test('name-only Auth metadata is supported', async () => {
  assert.deepEqual(await readSchoolOwners(client({ metadata: { name: ' Grace Hopper ' } }), 'v', 's'), { status: 'ready', names: ['Grace Hopper'] });
});

test('legacy public profile is used only when Auth has no usable name', async () => {
  const db = client({ metadata: { first_name: {}, last_name: null, name: ' ' }, profile: { first_name: 'Grace', last_name: 'Hopper' } });
  assert.deepEqual(await readSchoolOwners(db, 'v', 's'), { status: 'ready', names: ['Grace Hopper'] });
  assert.ok(db.calls.some(c => Array.isArray(c) && c[0] === 'id' && c[1] === 'u1'));
});

test('missing names never fall back to email or school name', async () => {
  assert.deepEqual(await readSchoolOwners(client({ metadata: {} }), 'v', 's'), { status: 'ready', names: ['Naam niet ingevuld'] });
});

test('Auth lookup error returns unavailable, not misleading missing-name message', async () => {
  assert.deepEqual(await readSchoolOwners(client({ authError: Error('offline') }), 'v', 's'), { status: 'unavailable' });
});

test('membership lookup failure cannot expose partial personal data', async () => {
  const db = client(); db.from = () => { throw Error('offline'); };
  assert.deepEqual(await readSchoolOwners(db, 'v', 's'), { status: 'unavailable' });
  assert.equal(db.calls.length, 1);
});

test('duplicate memberships are deduplicated and multiple owners retained', async () => {
  const db = client({ owners: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }] });
  assert.deepEqual(await readSchoolOwners(db, 'v', 's'), { status: 'ready', names: ['Ada Lovelace', 'Ada Lovelace'] });
  assert.equal(db.calls.filter(c => Array.isArray(c) && c[0] === 'auth').length, 2);
});

test('school without owners does not query Auth', async () => {
  const db = client({ owners: [] });
  assert.deepEqual(await readSchoolOwners(db, 'v', 's'), { status: 'ready', names: [] });
  assert.equal(db.calls.filter(c => Array.isArray(c) && c[0] === 'auth').length, 0);
});


test('checkout-first signup name is read only for matching school, owner and activated status', async () => {
  const db = client({ metadata: { email_verified: true }, profile: { name: '' }, registration: { first_name: 'Test', last_name: 'Eigenaar' } });
  assert.deepEqual(await readSchoolOwners(db, 'v', 'school'), { status: 'ready', names: ['Test Eigenaar'] });
  const query = db.calls.slice(db.calls.indexOf('pending_registrations'));
  assert.deepEqual(query, ['pending_registrations', 'first_name,last_name', ['school_id', 'school'], ['auth_user_id', 'u1'], ['status', 'activated']]);
});

test('an existing profile name does not read historical registration names', async () => {
  for (const options of [{}, { metadata: {}, profile: { name: 'Current name' } }]) {
    const db = client(options);
    await readSchoolOwners(db, 'v', 's');
    assert.ok(!db.calls.includes('pending_registrations'));
  }
});

test('ambiguous or failed registration lookup does not return a guessed name', async () => {
  const db = client({ metadata: {}, registration: { first_name: 'Wrong' }, registrationError: Error('multiple rows') });
  assert.deepEqual(await readSchoolOwners(db, 'v', 's'), { status: 'unavailable' });
});
