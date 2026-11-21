import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { GET } from '../app/(site)/inloggen-per-mail/route.ts';

test('een mailpreview verbruikt de link pas wanneer de gebruiker de app opent', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.example.test';
  const response = GET();
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const html = await response.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const type of ['magiclink', 'signup', 'recovery']) {
    const token = 'pkce_' + 'a'.repeat(56);
    const open = { hidden: true };
    const destinations = [];
    runInNewContext(script, {
      URL, URLSearchParams,
      location: { hash: '#type=' + type + '&token=' + token, assign: url => destinations.push(url) },
      document: { getElementById: id => id === 'open' ? open : {} },
    });
    assert.deepEqual(destinations, []);
    if (type === 'recovery') {
      assert.equal(open.hidden, true);
      continue;
    }
    assert.equal(open.hidden, false);
    open.onclick();
    const target = new URL(destinations[0]);
    assert.equal(target.origin + target.pathname, 'https://auth.example.test/auth/v1/verify');
    assert.deepEqual(Object.fromEntries(target.searchParams), { type, token, redirect_to: 'ribba://student-login' });
  }
});

test('alleen de nieuwe mailroute opent rechtstreeks op iOS', () => {
  const association = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
  const paths = association.applinks.details[0].components.map(item => item['/']);
  assert.ok(paths.includes('/inloggen-per-mail/app'));
  assert.ok(!paths.includes('/inloggen-per-mail'));
});
