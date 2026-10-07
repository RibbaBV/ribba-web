import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFreshSupportMfa, supportMfaDeadline, SUPPORT_MFA_MAX_AGE_SECONDS } from '../lib/support-session.ts';
const now = 1800000000000;
const sec = now / 1000;
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const claims = (timestamp) => ({ aal: 'aal2', amr: [{ method: 'totp', timestamp }] });
test('MFA verloopt exact op de grens, ongeacht iat of token_refresh', () => {
  const deadline = sec - SUPPORT_MFA_MAX_AGE_SECONDS;
  assert.equal(hasFreshSupportMfa(jwt(claims(deadline + 1)), now), true);
  assert.equal(hasFreshSupportMfa(jwt({ ...claims(deadline), iat: sec }), now), false);
  assert.equal(hasFreshSupportMfa(jwt({ aal: 'aal2', amr: [...claims(deadline).amr, { method: 'token_refresh', timestamp: sec }] }), now), false);
});
test('ontbrekende, ongeldige en toekomstige MFA-claims weigeren', () => {
  for (const value of [null, {}, { aal: 'aal2' }, { ...claims(sec), aal: 'aal1' }, claims('1800000000'), claims(sec + 61), claims(-1), claims(1.5)]) {
    assert.equal(hasFreshSupportMfa(jwt(value), now), false, JSON.stringify(value));
  }
  for (const value of ['', 'a.b.c', 'a.bnVsbA.c']) assert.equal(hasFreshSupportMfa(value, now), false);
});
test('nieuwe MFA geeft nieuwe deadline; nieuwste geldige TOTP telt', () => {
  const value = { aal: 'aal2', amr: [{ method: 'totp', timestamp: sec - 50000 }, { method: 'totp', timestamp: sec }] };
  assert.equal(supportMfaDeadline(jwt(value), now), now + SUPPORT_MFA_MAX_AGE_SECONDS * 1000);
});
