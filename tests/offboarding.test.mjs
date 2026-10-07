// A4 (4 okt 2026): het opzegvenster op mijn.ribba.app vertelt wat er na het
// einde met de gegevens gebeurt.
//
// Besluit Önder: na echt opzeggen 30 dagen om alles te downloaden, daarna
// verwijdert Ribba alles van de rijschool en bewaart geen kopie. De oude tekst
// zei alleen "Daarna stopt je abonnement en kun je opnieuw kiezen". De bron van
// waarheid voor termijn en woorden is ribbaPro _shared/offboarding.ts; deze
// tests leggen de kopie hier vast, zodat een afwijking opvalt.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOWNLOAD_DAGEN,
  naOpzeggenTekst,
  OPZEGGEN_TEKST,
  verwijderdagLang,
} from '../lib/offboarding.ts';

describe('de verwijderdag', () => {
  test('30 kalenderdagen na de Nederlandse einddatum', () => {
    assert.equal(DOWNLOAD_DAGEN, 30);
    assert.equal(verwijderdagLang('2026-10-31T10:00:00Z'), '30 november 2026');
    assert.equal(verwijderdagLang('2026-12-15T10:00:00Z'), '14 januari 2027');
  });

  test('de Nederlandse dag telt, ook rond middernacht en de wintertijd', () => {
    assert.equal(verwijderdagLang('2026-10-31T23:30:00Z'), '1 december 2026'); // 1 nov in NL
    assert.equal(verwijderdagLang('2026-10-09T22:00:00Z'), '9 november 2026'); // middernacht NL, zomertijd
  });

  test('geen of ongeldige datum: null', () => {
    assert.equal(verwijderdagLang(null), null);
    assert.equal(verwijderdagLang('onzin'), null);
  });
});

describe('de teksten (goedgekeurd door Önder, 4 okt 2026)', () => {
  test('opzegvenster: toegang tot het einde, 30 dagen downloaden, dan alles weg, bewaarplicht', () => {
    assert.equal(
      OPZEGGEN_TEKST,
      'Je houdt toegang tot het einde van je betaalperiode. Daarna heb je nog 30 dagen om je gegevens te downloaden. ' +
        'Daarna verwijdert Ribba alles van je rijschool: facturen, leerlingen en lessen. Ribba bewaart geen kopie.\n\n' +
        'Je bent zelf verplicht je facturen 7 jaar te bewaren. Download ze op tijd in de app via Instellingen → Alles downloaden.',
    );
  });

  test('na opzeggen: de datum, of niets als die onbekend is', () => {
    assert.equal(
      naOpzeggenTekst('2026-10-31T10:00:00Z'),
      'Download je gegevens in de app vóór 30 november 2026; daarna verwijdert Ribba alles van je rijschool.',
    );
    assert.equal(naOpzeggenTekst(null), null);
  });
});

describe('de pagina', () => {
  const pagina = readFileSync(new URL('../app/(site)/upgrade/page.tsx', import.meta.url), 'utf8');

  test('het opzegvenster gebruikt de vaste tekst; de oude zin is weg', () => {
    assert.match(pagina, /title="Abonnement opzeggen\?"\s*body=\{OPZEGGEN_TEKST\}/);
    assert.doesNotMatch(pagina, /Daarna stopt je abonnement en kun je opnieuw kiezen/);
  });

  test('na opzeggen staat de verwijderdatum erbij', () => {
    assert.match(pagina, /\{naOpzeggenTekst\(periodEnd\) && \(/);
  });

  test('"toegang tot" en de verwijderdatum rekenen allebei in Nederlandse tijd', () => {
    // Anders ziet iemand buiten Nederland, bij een einde rond middernacht, twee
    // datums die geen 30 dagen uit elkaar lijken te liggen (CodeRabbit, #97).
    assert.match(pagina, /Je hebt toegang tot <strong>\{new Date\(periodEnd\)\.toLocaleDateString\('nl-NL', \{[^}]*timeZone: 'Europe\/Amsterdam' \}\)\}/);
  });

  test('de witregel in de tekst wordt getoond', () => {
    assert.match(pagina, /margin: '0 0 24px', whiteSpace: 'pre-line' \}\}>\s*\{body\}/);
  });
});
