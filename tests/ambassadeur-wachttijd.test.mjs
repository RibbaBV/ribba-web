// De wachttijd op een ambassadeursbeloning.
//
// Ribba geeft 60 dagen geld terug. Een beloning staat daarom 30 dagen vast
// voordat hij te innen is, zodat een terugboeking hem nog kan tegenhouden.
// Deze toets bepaalt wat het scherm toont; de innen-route doet hem nog eens in
// SQL. Klappen de twee randgevallen hieronder om, dan kost dat direct geld of
// zet het iemands geld voorgoed vast.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { beloningIsVrij } from '../lib/ribba-ambassadeur.ts';

const NU = new Date('2026-10-11T12:00:00.000Z');

describe('beloningIsVrij', () => {
  test('een datum in de toekomst houdt de beloning vast', () => {
    assert.equal(beloningIsVrij('2026-10-12T12:00:00.000Z', NU), false);
  });

  test('een datum in het verleden geeft hem vrij', () => {
    assert.equal(beloningIsVrij('2026-10-10T12:00:00.000Z', NU), true);
  });

  test('het moment zelf telt als vrij', () => {
    // "Klaar op 11 oktober" moet op 11 oktober werken, niet pas een tik later.
    assert.equal(beloningIsVrij('2026-10-11T12:00:00.000Z', NU), true);
  });

  test('een seconde ervoor telt nog niet', () => {
    assert.equal(beloningIsVrij('2026-10-11T12:00:01.000Z', NU), false);
  });

  test('null telt als vrij', () => {
    // De rijen van vóór de wachttijd dragen geen datum. Zou null als "nog niet
    // vrij" tellen, dan staat hun geld voorgoed vast.
    assert.equal(beloningIsVrij(null, NU), true);
  });

  test('een onleesbare datum houdt niemand tegen', () => {
    // Fail-open is hier de juiste kant: het alternatief is een beloning die
    // nooit meer vrijkomt door een kapotte waarde in de kolom.
    assert.equal(beloningIsVrij('geen datum', NU), true);
  });
});
