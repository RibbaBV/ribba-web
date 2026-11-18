// Kaart "Zelf aangemeld" op /support/dashboard/learners (11 nov 2026).
// Önder wilde zien hoeveel leerlingen zelf de app downloaden en een account maken,
// zonder uitnodiging. Als deze test omvalt, is de kaart weg of toont hij iets
// wat de database niet (meer) levert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zelfAangemeldUitleg } from '../lib/owner-learners.ts';

const basis = { registration_hint: 11, hint_with_active_school: 1 };

test('met de nieuwe metingen: 30 dagen, zonder school en nu bij een school', () => {
  assert.equal(zelfAangemeldUitleg({ ...basis, hint_new_30: 9, hint_no_school: 10 }),
    '9 in de laatste 30 dagen · 10 nog zonder rijschool · 1 nu bij een rijschool');
});

test('vóór de databasewijziging: alleen wat al bekend is, geen "undefined"', () => {
  const uit = zelfAangemeldUitleg({ ...basis });
  assert.equal(uit, '1 nu bij een rijschool');
  assert.doesNotMatch(uit, /undefined|NaN/);
});

test('de kaart staat op de leerlingenpagina en toont registration_hint', () => {
  const src = readFileSync('app/(support)/support/dashboard/learners/page.tsx', 'utf8');
  assert.match(src, /<span>Zelf aangemeld · zonder uitnodiging<\/span><strong>\{data\.metrics\.registration_hint\}<\/strong><small>\{zelfAangemeldUitleg\(data\.metrics\)\}<\/small>/);
});
