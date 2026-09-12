// De tipcode van een ambassadeur: wat telt als code, en welke tip wint.
//
// Deze module staat op het kruispunt van drie plekken die elkaar niet kennen:
// ribba.nl zet de code in een link, de browser bewaart hem in een cookie, en
// /api/signup/start haalt hem uit een request-body. Gaan die drie uiteen over
// wat een geldige code is, dan verdwijnt een tip zonder foutmelding. Daarom is
// dit de enige plek waar de vorm wordt vastgesteld, en daarom is dit de test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIP_COOKIE,
  TIP_DAGEN,
  huidigeTip,
  leesTipUitCookies,
  leesTipUitZoekstring,
  normaliseerTipCode,
  tipLink,
} from '../lib/ribba-tip.ts';

describe('normaliseerTipCode', () => {
  test('accepteert een code en maakt er hoofdletters van', () => {
    assert.equal(normaliseerTipCode('ab3k9m2p'), 'AB3K9M2P');
  });

  test('knipt witruimte eromheen weg', () => {
    // Codes worden geplakt uit een mail of een appje; daar komt spatie mee.
    assert.equal(normaliseerTipCode('  AB3K9M2P \n'), 'AB3K9M2P');
  });

  test('weigert te kort en te lang', () => {
    assert.equal(normaliseerTipCode('AB3'), null);
    assert.equal(normaliseerTipCode('A'.repeat(17)), null);
  });

  test('weigert tekens buiten letters en cijfers', () => {
    // Anders zou een code met een quote of een procentteken zo een query of
    // een URL in kunnen lopen.
    assert.equal(normaliseerTipCode("AB3K'9M"), null);
    assert.equal(normaliseerTipCode('AB3K%39M'), null);
    assert.equal(normaliseerTipCode('AB3K-9M2'), null);
  });

  test('weigert alles wat geen string is', () => {
    for (const waarde of [null, undefined, 12345678, {}, ['AB3K9M2P'], true]) {
      assert.equal(normaliseerTipCode(waarde), null);
    }
  });
});

describe('leesTipUitZoekstring', () => {
  test('haalt de code uit de querystring', () => {
    assert.equal(leesTipUitZoekstring('?tip=ab3k9m2p&utm_source=ads'), 'AB3K9M2P');
  });

  test('geeft null zonder tip-parameter', () => {
    assert.equal(leesTipUitZoekstring('?utm_source=ads'), null);
    assert.equal(leesTipUitZoekstring(''), null);
  });

  test('laat een ongeldige parameter vallen in plaats van hem door te geven', () => {
    assert.equal(leesTipUitZoekstring('?tip=%3Cscript%3E'), null);
  });
});

describe('leesTipUitCookies', () => {
  test('vindt de cookie tussen andere cookies', () => {
    assert.equal(
      leesTipUitCookies(`sb-access-token=xyz; ${TIP_COOKIE}=AB3K9M2P; theme=dark`),
      'AB3K9M2P',
    );
  });

  test('geeft null wanneer de cookie ontbreekt', () => {
    assert.equal(leesTipUitCookies('theme=dark'), null);
    assert.equal(leesTipUitCookies(''), null);
  });

  test('valt niet over een cookie die niet meer te decoderen is', () => {
    assert.equal(leesTipUitCookies(`${TIP_COOKIE}=%E0%A4%A`), null);
  });

  test('trapt niet in een cookie waarvan de naam op de onze eindigt', () => {
    assert.equal(leesTipUitCookies(`niet_${TIP_COOKIE}=AB3K9M2P`), null);
  });
});

describe('huidigeTip', () => {
  test('geeft null buiten de browser', () => {
    // De functie wordt geïmporteerd door het registratieformulier, dat ook
    // server-side gerenderd wordt. Zonder deze bewaking crasht die render.
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(huidigeTip(), null);
  });
});

describe('tipLink', () => {
  test('wijst naar ribba.nl, waar de advertentie naartoe stuurt', () => {
    assert.equal(tipLink('AB3K9M2P'), 'https://ribba.nl/voor-rijscholen?tip=AB3K9M2P');
  });

  test('codeert de code, ook als er ooit iets raars in belandt', () => {
    assert.ok(!tipLink('A B').includes(' '));
  });
});

describe('attributietermijn', () => {
  test('staat op 30 dagen, zoals de advertentie en de voorwaarden beloven', () => {
    assert.equal(TIP_DAGEN, 30);
  });
});
