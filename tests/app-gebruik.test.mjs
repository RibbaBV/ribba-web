// Supportpagina "Gebruik van de app" (10 nov 2026).
//
// Waar het misgaat als deze tests omvallen:
//   • de route komt buiten de supportpoort (withSupportAccess) of zonder logregel;
//   • een vrije periode bereikt de database (alleen 7, 30 of 90);
//   • de weergave maakt van een onbekende knop iets wat op een naam lijkt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePeriode, knopLabel, procent, gebruikersPerDag, rolLabel } from '../lib/app-gebruik.ts';

test('periode: alleen 7, 30 of 90; anders 30', () => {
  assert.equal(parsePeriode('7'), 7);
  assert.equal(parsePeriode('90'), 90);
  for (const v of [null, '', '365', '-1', 'abc', '30; drop table']) assert.equal(parsePeriode(v), 30);
});

test('knopnamen: id, vertaalsleutel, of uitdrukkelijk "zonder vaste naam"', () => {
  assert.deepEqual(knopLabel('home-les-plannen'), { naam: 'home-les-plannen', soort: 'id' });
  assert.deepEqual(knopLabel('tekst:studentPraktijk.lesPlannen'), { naam: 'studentPraktijk.lesPlannen', soort: 'tekst' });
  assert.equal(knopLabel('knop').naam, 'Knop zonder vaste naam');
  assert.equal(knopLabel('knop:button').naam, 'Knop zonder vaste naam');
  assert.equal(knopLabel('invoerveld').naam, 'Invoerveld');
});

test('procent en rol', () => {
  assert.equal(procent(1, 4), '25%');
  assert.equal(procent(0, 0), '—');
  assert.equal(rolLabel('eigenaar'), 'Eigenaar');
  assert.equal(rolLabel('iets'), 'iets');
});

test('per dag: rollen samengeteld, op datum', () => {
  assert.deepEqual(gebruikersPerDag([
    { dag: '2026-11-11', rol: 'leerling', gebruikers: 2 },
    { dag: '2026-11-10', rol: 'eigenaar', gebruikers: 1 },
    { dag: '2026-11-11', rol: 'ouder', gebruikers: 1 },
  ]), [{ dag: '2026-11-10', gebruikers: 1 }, { dag: '2026-11-11', gebruikers: 3 }]);
});

test('route: via de supportpoort, niveau 0, met logregel en zonder eigenaarbeperking', () => {
  const src = readFileSync('app/api/support/gebruik/route.ts', 'utf8');
  assert.match(src, /return withSupportAccess\(\s*req,\s*\{ action: 'appgebruik\.view', level: 0, targetType: 'app_events', meta: \{ dagen, intern \} \}/);
  assert.doesNotMatch(src, /ownerOnly/);
  assert.match(src, /supabase\.rpc\('support_app_gebruik', \{\s*p_dagen: dagen,/);
  assert.match(src, /const dagen = parsePeriode\(url\.searchParams\.get\('dagen'\)\);/);
});

test('de pagina is bereikbaar vanuit het rijscholenoverzicht en de eigenaarzijbalk', () => {
  assert.match(readFileSync('app/(support)/support/school-overview.tsx', 'utf8'), /href="\/support\/gebruik"/);
  assert.match(readFileSync('app/(support)/support/support-shell.tsx', 'utf8'), /href="\/support\/gebruik"/);
});

test('zonder sessie: een inlogknop, geen doodlopend scherm (zoals #138)', () => {
  const src = readFileSync('app/(support)/support/gebruik/page.tsx', 'utf8');
  assert.match(src, /status === 'laden' \? <p role="status">Sessie controleren…<\/p>/);
  assert.match(src, /<Link href="\/support" className=\{styles\.quietButton\}>Inloggen<\/Link>/);
});
