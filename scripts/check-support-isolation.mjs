// Na next build: toets de werkelijk uitgeleverde HTML en browserbundels.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const markers = ['googletagmanager.com/gtag', 'gtag-consent-default', 'ribba_signup_attribution'];

function browserCode(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map((match) => decodeURIComponent(match[1].split('?')[0]))
    .filter((src) => src.startsWith('/_next/'));
  assert.ok(scripts.length > 0, 'Geen browserbundels gevonden; controle kan geen bewijs leveren');
  return scripts.map((src) => read(`.next/${src.slice('/_next/'.length)}`)).join('\n');
}

assert.equal(existsSync(resolve(root, 'app/layout.tsx')), false,
  'Een gedeelde root-layout kan marketingcode laten voortleven bij navigatie naar support');
assert.ok(existsSync(resolve(root, 'app/(support)/layout.tsx')));
assert.ok(existsSync(resolve(root, 'app/(site)/layout.tsx')));

const support = read('.next/server/app/support.html');
const supportDelivered = support + browserCode(support);
for (const marker of markers) {
  assert.ok(!supportDelivered.includes(marker), `Marketingcode op support: ${marker}`);
}
assert.match(support, /noindex/, 'Support hoort niet geïndexeerd te worden');

for (const route of ['pro', 'registreren', 'registreren/ontvangen']) {
  const html = read(`.next/server/app/${route}.html`);
  const delivered = html + browserCode(html);
  for (const marker of markers) {
    assert.ok(delivered.includes(marker), `Bestaande marketingcode ontbreekt op /${route}: ${marker}`);
  }
}

console.log('Support zonder marketingcode; marketing- en registratiepagina’s behouden hun scripts.');
