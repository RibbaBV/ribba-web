import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportJson } from '../lib/support-response.ts';
import config from '../next.config.ts';

for (const status of [200, 400, 401, 403, 429, 500, 503]) {
  test(`supportantwoord ${status} is niet cachebaar`, async () => {
    const response = supportJson({ eligible: false }, status);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vercel-CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vary'), 'Authorization');
    assert.deepEqual(await response.json(), { eligible: false });
  });
}

test('supportpagina en API blokkeren framing zonder andere routes te raken', async () => {
  const rules = await config.headers();
  const supportRules = rules.filter(({ source }) => source.includes('support'));
  assert.deepEqual(supportRules.map(({ source }) => source), [
    '/support/:path*', '/api/support/:path*',
  ]);
  for (const rule of supportRules) {
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  }
  assert.equal(rules.find(({ source }) => source === '/.well-known/apple-app-site-association')
    .headers[0].value, 'application/json');
  assert.equal(rules.find(({ source }) => source === '/.well-known/assetlinks.json')
    .headers[0].value, 'application/json');
});
