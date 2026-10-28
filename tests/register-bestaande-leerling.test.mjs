// SEC003 (securityaudit 27 okt 2026): het publieke inschrijfformulier mag een
// leerlingrij die de rijschool al had aangemaakt niet meer overschrijven.
// Lege velden aanvullen mag; ingevulde velden en de status blijven staan.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aanvullingVoorBestaandeLeerling,
  statusLabel,
} from '../lib/register-bestaande-leerling.ts';

const ingevuld = {
  first_name: 'Eva',
  last_name: 'Aanvaller',
  phone: '+31600000000',
  address: 'Nepstraat 1',
  postal_code: '1234AB',
  city: 'Nergens',
  license_type: 'B',
  date_of_birth: '2000-01-01',
};

describe('aanvullingVoorBestaandeLeerling', () => {
  test('overschrijft geen enkel veld dat de school al had', () => {
    const bestaand = {
      first_name: 'Lisa', last_name: 'de Vries', phone: '+31611111111',
      address: 'Echte straat 5', postal_code: '3011AA', city: 'Rotterdam',
      license_type: 'A', date_of_birth: '2006-05-05', status: 'active',
    };
    const { aanvulling, verschillen } = aanvullingVoorBestaandeLeerling(bestaand, ingevuld);
    assert.deepEqual(aanvulling, {});
    assert.equal(verschillen.length, 8);
    assert.equal(verschillen[0].bestaand, 'Lisa');
    assert.equal(verschillen[0].ingevuld, 'Eva');
  });

  test('vult alleen lege velden aan', () => {
    const bestaand = {
      first_name: 'Lisa', last_name: 'de Vries', phone: null, address: '',
      postal_code: null, city: '  ', license_type: 'B', date_of_birth: null, status: 'active',
    };
    const { aanvulling, verschillen } = aanvullingVoorBestaandeLeerling(bestaand, ingevuld);
    assert.deepEqual(aanvulling, {
      phone: '+31600000000', address: 'Nepstraat 1', postal_code: '1234AB',
      city: 'Nergens', date_of_birth: '2000-01-01',
    });
    assert.deepEqual(verschillen.map((v) => v.veld), ['first_name', 'last_name']);
  });

  test('raakt de status nooit aan', () => {
    const { aanvulling } = aanvullingVoorBestaandeLeerling({ status: 'active' }, { ...ingevuld, status: 'waitlist' });
    assert.equal('status' in aanvulling, false);
  });

  test('zelfde gegevens met andere hoofdletters tellen niet als verschil', () => {
    const { verschillen } = aanvullingVoorBestaandeLeerling(
      { first_name: 'eva', postal_code: '1234ab' },
      ingevuld,
    );
    assert.equal(verschillen.length, 0);
  });
});

describe('statusLabel', () => {
  test('toont de echte status in de mail aan de school', () => {
    assert.equal(statusLabel('active'), 'Actief');
    assert.equal(statusLabel('graduated'), 'Geslaagd');
    assert.equal(statusLabel(null), 'Wachtlijst');
  });
});

describe('de route', () => {
  const route = readFileSync(new URL('../app/api/register/route.ts', import.meta.url), 'utf8');

  test('werkt een bestaande rij alleen bij met de aanvulling', () => {
    assert.doesNotMatch(route, /\.update\(studentData\)/);
    assert.match(route, /\.update\(uitkomst\.aanvulling\)/);
  });

  test('werkt alleen een rij zonder account bij', () => {
    assert.match(route, /\.update\(uitkomst\.aanvulling\)\s*\.eq\('id', existingStudent\.id\)\s*\.is\('user_id', null\)/);
  });

  test('zegt in de mail niet meer standaard "Wachtlijst"', () => {
    assert.doesNotMatch(route, /<strong>Status:<\/strong> Wachtlijst/);
  });
});
