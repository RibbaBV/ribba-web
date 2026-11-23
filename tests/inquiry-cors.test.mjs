import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, corsPreflight } from '../lib/cors.ts';

test('the comparison websites can POST JSON inquiries', () => {
  for (const domain of ['ribba.nl', 'www.ribba.nl', 'ribba.app', 'www.ribba.app']) {
    const origin = 'https://' + domain;
    const preflight = corsPreflight(origin);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Content-Type/i);
    assert.equal(corsHeaders(origin)['Access-Control-Allow-Origin'], origin);
  }
  assert.equal(corsPreflight('https://ribba.nl.example.org').headers.get('Access-Control-Allow-Origin'), null);
});
