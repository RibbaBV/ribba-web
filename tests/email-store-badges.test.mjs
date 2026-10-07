// Logo en store-badges in de mails van de website (5 okt 2026): geen "R"-
// blokje meer als logo, en de officiële Nederlandse badges als PNG uit de
// publieke opslag in plaats van zelfgemaakte knoppen of tekstlinks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  ribbaLogoHtml, storeBadgesHtml, APP_STORE_BADGE_URL, GOOGLE_PLAY_BADGE_URL, RIBBA_LOGO_URL,
} = await import('../lib/email-store-badges.ts');
const { APP_STORE_URL, PLAY_STORE_URL } = await import('../lib/app-links.ts');

test('badges: twee gelinkte PNG-badges uit public-assets', () => {
  const html = storeBadgesHtml();
  assert.match(APP_STORE_BADGE_URL, /public-assets\/app-store-badge-nl\.png$/);
  assert.match(GOOGLE_PLAY_BADGE_URL, /public-assets\/google-play-badge-nl\.png$/);
  assert.ok(html.includes(`href="${APP_STORE_URL}"`));
  assert.ok(html.includes(`href="${PLAY_STORE_URL}"`));
  assert.ok(html.includes('alt="Download in de App Store"'));
  assert.ok(html.includes('alt="Ontdek het op Google Play"'));
});

test('logo: het Ribba-logo', () => {
  assert.ok(ribbaLogoHtml().includes(RIBBA_LOGO_URL));
});

for (const f of ['app/api/register-school/route.ts', 'app/api/register/route.ts', 'lib/marketplace-emails.ts']) {
  test(`${f}: geen R-blokje en geen zelfgemaakte storeknoppen`, () => {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /font-size: 20px;">R<\/span>/);
    assert.doesNotMatch(src, /📱 App Store|▶ Google Play/);
    assert.doesNotMatch(src, /font-weight:600;font-size:14px">App Store<\/a>/);
  });
}

test('register-school en register gebruiken het logo; register-school en marketplace de badges', () => {
  const rs = readFileSync(new URL('../app/api/register-school/route.ts', import.meta.url), 'utf8');
  const r = readFileSync(new URL('../app/api/register/route.ts', import.meta.url), 'utf8');
  const m = readFileSync(new URL('../lib/marketplace-emails.ts', import.meta.url), 'utf8');
  assert.match(rs, /ribbaLogoHtml\(\)/);
  assert.match(rs, /storeBadgesHtml\(\)/);
  assert.equal((r.match(/ribbaLogoHtml\(\)/g) ?? []).length, 2);
  assert.match(m, /storeBadgesHtml\(\)/);
});
