import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let values, index, effect, callback, resolveSession, tick, unsubscribed;
mock.module('react', { namedExports: {
  useState(initial) { const key = index++; values[key] = initial; return [initial, (v) => { values[key] = v; }]; },
  useEffect(fn) { effect = fn; },
} });
mock.module('@supabase/ssr', { namedExports: { createBrowserClient: () => ({ auth: {
  onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
  getSession() { return new Promise((resolve) => { resolveSession = resolve; }); },
} }) } });
const { useSupportToken } = await import('../app/(support)/support/client.ts');
function SupportHarness() {
  values = []; index = 0; unsubscribed = false;
  globalThis.window = Object.assign(new EventTarget(), { setInterval(fn) { tick = fn; return 1; }, clearInterval() {} });
  globalThis.document = new EventTarget();
  useSupportToken();
  return effect();
}
function session(age = 0) {
  const claims = { aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - age }] };
  return { access_token: `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s` };
}
test('signout wint van een oudere getSession-response', async () => {
  const cleanup = SupportHarness();
  callback('SIGNED_OUT', null);
  resolveSession({ data: { session: session() }, error: null });
  await Promise.resolve();
  assert.deepEqual(values, [null, 'geen-toegang']);
  cleanup(); assert.equal(unsubscribed, true);
});
test('refresh vervangt het token; verlopen MFA en signout verbergen data', () => {
  const cleanup = SupportHarness();
  const fresh = session(); callback('SIGNED_IN', fresh);
  assert.deepEqual(values, [fresh.access_token, 'ok']);
  const expired = session(8 * 3600); callback('TOKEN_REFRESHED', expired);
  assert.deepEqual(values, [null, 'geen-toegang']);
  callback('MFA_CHALLENGE_VERIFIED', fresh);
  assert.equal(values[1], 'ok');
  callback('SIGNED_OUT', null);
  tick();
  assert.deepEqual(values, [null, 'geen-toegang']);
  cleanup();
});
test('deadline werkt ook zonder auth-event, en unmount negeert late callbacks', () => {
  const cleanup = SupportHarness();
  const time = Date.now();
  callback('SIGNED_IN', session());
  mock.method(Date, 'now', () => time + 8 * 3600 * 1000);
  tick();
  assert.deepEqual(values, [null, 'geen-toegang']);
  mock.restoreAll();
  cleanup();
  callback('SIGNED_IN', session());
  assert.deepEqual(values, [null, 'geen-toegang']);
});
