// Gratis proefles — de webkant.
//
// Het contract ligt in ribbaPro (migratie 20260912140000_gratis_proefles.sql).
// Wat hier bewaakt wordt, is alles wat de database NIET ziet of pas te laat:
//
//   • de kalender rekent in Europe/Amsterdam, ook als de browser dat niet doet,
//     en ook op de dag dat de klok verspringt — anders stuurt de flow een tijd
//     die de database als `ongeldig_tijdslot` weigert;
//   • de API stuurt de RPC-parameters met exact de namen uit de migratie en de
//     gepubliceerde versies van voorwaarden en privacy — een tikfout in een
//     parameternaam is in PostgREST een 404 op de functie, geen compileerfout;
//   • een honeypot-treffer raakt de database niet;
//   • tokens die geen UUID zijn, komen niet eens bij de database.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

let rpcAanroepen = [];
let rpcAntwoord = { data: { uitkomst: 'ingediend' }, error: null };
let toegestaan = true;

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@/lib/rate-limit', { namedExports: { rateLimit: () => toegestaan } });
mock.module('@/lib/marketplace-db', {
  namedExports: {
    getServiceClient: () => ({
      rpc: async (naam, params) => {
        rpcAanroepen.push({ naam, params });
        return rpcAntwoord;
      },
    }),
  },
});

const slots = await import('../lib/proefles-slots.ts');
const proefles = await import('../lib/proefles.ts');
const { parsePoint } = await import('../lib/pdok.ts');
const { canonicalHostForPath } = await import('../lib/domains.ts');
const { LEGAL_VERSIONS } = await import('../lib/legal-versions.ts');
const aanvragen = await import('../app/api/proefles/aanvragen/route.ts');
const bevestigen = await import('../app/api/proefles/bevestigen/route.ts');
const annuleren = await import('../app/api/proefles/annuleren/route.ts');
const aanbod = await import('../app/api/proefles/aanbod/route.ts');

function verzoek(body, headers = {}) {
  const h = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'test-agent', ...headers };
  return {
    headers: { get: (k) => h[k.toLowerCase()] ?? null },
    json: async () => {
      if (body === '__kapot__') throw new SyntaxError('bad json');
      return body;
    },
  };
}

beforeEach(() => {
  rpcAanroepen = [];
  rpcAntwoord = { data: { uitkomst: 'ingediend' }, error: null };
  toegestaan = true;
});

// ── Tijdsloten ──────────────────────────────────────────────────────────────

describe('proeflesDagen', () => {
  const NU = new Date('2026-09-12T10:00:00Z'); // zaterdag 12:00 in Amsterdam

  test('morgen t/m +7 dagen, elk 08:00 t/m 21:00 op het hele uur', () => {
    const dagen = slots.proeflesDagen(NU);
    assert.equal(dagen.length, 7);
    assert.equal(dagen[0].datum, '2026-09-13');
    assert.equal(dagen[6].datum, '2026-09-19');
    for (const d of dagen) {
      assert.deepEqual(d.slots.map((s) => s.label), ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']);
    }
    // Zomertijd: 08:00 in Amsterdam is 06:00 UTC.
    assert.equal(dagen[0].slots[0].iso, '2026-09-13T06:00:00.000Z');
    assert.equal(dagen[6].slots[13].iso, '2026-09-19T19:00:00.000Z');
    assert.equal(dagen[0].langLabel, 'zondag 13 september');
  });

  test('niets binnen 12 uur vanaf nu', () => {
    const laat = new Date('2026-09-12T19:30:00Z'); // 21:30 in Amsterdam
    const [morgen] = slots.proeflesDagen(laat);
    const beschikbaar = morgen.slots.filter((s) => s.beschikbaar).map((s) => s.label);
    // 21:30 + 12 u = 09:30 → eerste slot 10:00.
    assert.equal(beschikbaar[0], '10:00');
    assert.equal(morgen.slots.find((s) => s.label === '09:00').beschikbaar, false);
  });

  test('de dag dat de klok teruggaat (25 okt 2026) rekent met wintertijd', () => {
    const dagen = slots.proeflesDagen(new Date('2026-10-23T10:00:00Z'));
    const za = dagen.find((d) => d.datum === '2026-10-24');
    const zo = dagen.find((d) => d.datum === '2026-10-25');
    assert.equal(za.slots[0].iso, '2026-10-24T06:00:00.000Z'); // CEST
    assert.equal(zo.slots[0].iso, '2026-10-25T07:00:00.000Z'); // CET
    assert.equal(zo.slots.length, 14);
  });

  test('de tijdzone van de browser maakt niets uit', () => {
    const oud = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      const la = slots.proeflesDagen(new Date('2026-09-12T10:00:00Z'));
      process.env.TZ = 'Asia/Tokyo';
      const tokyo = slots.proeflesDagen(new Date('2026-09-12T10:00:00Z'));
      assert.deepEqual(la, tokyo);
      assert.equal(la[0].slots[0].iso, '2026-09-13T06:00:00.000Z');
    } finally {
      process.env.TZ = oud;
    }
  });

  test('isGeldigProeflesSlot volgt dezelfde regels', () => {
    assert.equal(slots.isGeldigProeflesSlot('2026-09-13T08:00:00.000Z', NU), true);   // 10:00
    assert.equal(slots.isGeldigProeflesSlot('2026-09-13T08:30:00.000Z', NU), false);  // 10:30
    assert.equal(slots.isGeldigProeflesSlot('2026-09-13T04:00:00.000Z', NU), false);  // 06:00
    assert.equal(slots.isGeldigProeflesSlot('2026-09-12T14:00:00.000Z', NU), false);  // vandaag
    assert.equal(slots.isGeldigProeflesSlot('2026-09-20T08:00:00.000Z', NU), false);  // dag 8
    assert.equal(slots.isGeldigProeflesSlot('onzin', NU), false);
  });
});

// ── Validatie ───────────────────────────────────────────────────────────────

const GELDIG = {
  naam: ' Sanne de Vries ',
  email: 'Sanne@Example.nl',
  telefoon: '06 12345678',
  adres: 'Domplein 1, 3512JC Utrecht',
  plaats: 'Utrecht',
  lat: 52.0912,
  lon: 5.1220,
  start_at: '2026-09-15T08:00:00.000Z',
  akkoord_voorwaarden: true,
  akkoord_privacy: true,
  akkoord_delen: true,
};

describe('valideerAanvraag en helpers', () => {
  test('normaliseert geldige invoer', () => {
    const r = proefles.valideerAanvraag(GELDIG);
    assert.equal(r.ok, true);
    assert.equal(r.invoer.naam, 'Sanne de Vries');
    assert.equal(r.invoer.email, 'sanne@example.nl');
  });

  test('elke ontbrekende toestemming is een toestemmingsfout', () => {
    for (const k of ['akkoord_voorwaarden', 'akkoord_privacy', 'akkoord_delen']) {
      const r = proefles.valideerAanvraag({ ...GELDIG, [k]: false });
      assert.equal(r.ok, false);
      assert.equal(r.fout.veld, 'toestemming', k);
    }
  });

  test('locatie buiten Nederland, of als string, wordt geweigerd', () => {
    assert.equal(proefles.valideerAanvraag({ ...GELDIG, lat: 48.85, lon: 2.35 }).ok, false);
    assert.equal(proefles.valideerAanvraag({ ...GELDIG, lat: '52.09' }).ok, false);
  });

  test('isProeflesToken accepteert alleen UUID\'s', () => {
    assert.equal(proefles.isProeflesToken('4f0c6a3e-9b1d-4c2e-8f7a-1234567890ab'), true);
    assert.equal(proefles.isProeflesToken('4f0c6a3e'), false);
    assert.equal(proefles.isProeflesToken("' or 1=1 --"), false);
    assert.equal(proefles.isProeflesToken(undefined), false);
  });

  test('sanitizeBron laat alleen bekende korte strings door', () => {
    const b = proefles.sanitizeBron({ utm_source: 'google', tip: 'AB12', evil: 'x', gclid: 42, referrer: 'x'.repeat(500) });
    assert.deepEqual(Object.keys(b).sort(), ['referrer', 'tip', 'utm_source']);
    assert.equal(b.referrer.length, 300);
    assert.deepEqual(proefles.sanitizeBron(['x']), {});
  });

  test('parsePoint leest PDOK-centroïdes (lon eerst)', () => {
    assert.deepEqual(parsePoint('POINT(5.12202874 52.09119067)'), { lat: 52.09119067, lon: 5.12202874 });
    assert.equal(parsePoint('LINESTRING(1 2)'), null);
  });

  test('alle proefles-pagina\'s horen op mijn.ribba.app — daar linken de mails naartoe', () => {
    for (const p of ['/proefles', '/proefles/bevestigen/x', '/proefles/status/x', '/proefles/aanbod/x']) {
      assert.equal(canonicalHostForPath(p), 'mijn.ribba.app', p);
    }
    assert.equal(canonicalHostForPath('/api/proefles/aanvragen'), null);
  });
});

// ── POST /api/proefles/aanvragen ────────────────────────────────────────────

describe('POST /api/proefles/aanvragen', () => {
  test('stuurt exact de parameters uit de migratie, met de gepubliceerde versies', async () => {
    const res = await aanvragen.POST(verzoek({ ...GELDIG, bron: { utm_source: 'insta', onbekend: 'x' } }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { uitkomst: 'ingediend' });
    assert.equal(rpcAanroepen.length, 1);
    const { naam, params } = rpcAanroepen[0];
    assert.equal(naam, 'proefles_aanvraag_indienen');
    assert.deepEqual(Object.keys(params).sort(), [
      'p_adres', 'p_bron', 'p_delen_akkoord', 'p_email', 'p_ip', 'p_lat', 'p_lon', 'p_naam',
      'p_plaats', 'p_privacy_versie', 'p_start_at', 'p_telefoon', 'p_user_agent', 'p_voorwaarden_versie',
    ]);
    assert.equal(params.p_email, 'sanne@example.nl');
    assert.equal(params.p_voorwaarden_versie, LEGAL_VERSIONS.terms);
    assert.equal(params.p_privacy_versie, LEGAL_VERSIONS.privacy);
    assert.equal(params.p_delen_akkoord, true);
    assert.equal(params.p_ip, '203.0.113.7');
    assert.equal(params.p_user_agent, 'test-agent');
    assert.deepEqual(params.p_bron, { utm_source: 'insta' });
    assert.equal('aanvraag_id' in res.body, false);
  });

  test('honeypot: nep-succes, geen database', async () => {
    const res = await aanvragen.POST(verzoek({ ...GELDIG, website: 'http://spam.example' }));
    assert.deepEqual(res.body, { uitkomst: 'ingediend' });
    assert.equal(rpcAanroepen.length, 0);
  });

  test('vormfouten en ontbrekende toestemming komen niet bij de database', async () => {
    let res = await aanvragen.POST(verzoek({ ...GELDIG, email: 'geen-mail' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.uitkomst, 'ongeldige_gegevens');
    assert.equal(res.body.veld, 'email');
    res = await aanvragen.POST(verzoek({ ...GELDIG, akkoord_delen: false }));
    assert.equal(res.body.uitkomst, 'toestemming_ontbreekt');
    res = await aanvragen.POST(verzoek('__kapot__'));
    assert.equal(res.status, 400);
    assert.equal(rpcAanroepen.length, 0);
  });

  test('uitkomsten van de database gaan ongewijzigd door', async () => {
    for (const u of ['al_actief', 'te_vaak', 'ongeldig_tijdslot', 'niet_beschikbaar']) {
      rpcAntwoord = { data: { uitkomst: u }, error: null };
      const res = await aanvragen.POST(verzoek(GELDIG));
      assert.deepEqual(res.body, { uitkomst: u });
    }
  });

  test('een onbekende uitkomst of een databasefout is een 500, geen stil succes', async () => {
    rpcAntwoord = { data: { uitkomst: 'iets_nieuws' }, error: null };
    assert.equal((await aanvragen.POST(verzoek(GELDIG))).status, 500);
    rpcAntwoord = { data: null, error: { message: 'function not found' } };
    assert.equal((await aanvragen.POST(verzoek(GELDIG))).status, 500);
  });

  test('rate limit geeft 429 zonder database', async () => {
    toegestaan = false;
    const res = await aanvragen.POST(verzoek(GELDIG));
    assert.equal(res.status, 429);
    assert.equal(rpcAanroepen.length, 0);
  });
});

// ── Token-routes ────────────────────────────────────────────────────────────

const TOKEN = '4f0c6a3e-9b1d-4c2e-8f7a-1234567890ab';

describe('token-routes', () => {
  test('bevestigen geeft het leerlingtoken door voor de redirect', async () => {
    rpcAntwoord = { data: { uitkomst: 'bevestigd', status: 'zoekend', leerling_token: 'lt' }, error: null };
    const res = await bevestigen.POST(verzoek({ token: TOKEN }));
    assert.deepEqual(res.body, { uitkomst: 'bevestigd', leerling_token: 'lt' });
    assert.deepEqual(rpcAanroepen, [{ naam: 'proefles_email_bevestigen', params: { p_token: TOKEN } }]);
  });

  test('annuleren roept proefles_leerling_annuleren aan', async () => {
    rpcAntwoord = { data: { uitkomst: 'geannuleerd' }, error: null };
    const res = await annuleren.POST(verzoek({ token: TOKEN }));
    assert.deepEqual(res.body, { uitkomst: 'geannuleerd' });
    assert.equal(rpcAanroepen[0].naam, 'proefles_leerling_annuleren');
  });

  test('aanbod: elke actie met p_token en p_actie', async () => {
    for (const actie of ['accepteren', 'afwijzen', 'annuleren', 'afmelden']) {
      rpcAntwoord = { data: { uitkomst: 'al_vergeven' }, error: null };
      const res = await aanbod.POST(verzoek({ token: TOKEN, actie }));
      assert.deepEqual(res.body, { uitkomst: 'al_vergeven' });
    }
    assert.deepEqual(rpcAanroepen.map((a) => a.params.p_actie), ['accepteren', 'afwijzen', 'annuleren', 'afmelden']);
    assert.ok(rpcAanroepen.every((a) => a.naam === 'proefles_aanbod_reageren' && a.params.p_token === TOKEN));
  });

  test('ongeldige tokens en acties komen niet bij de database', async () => {
    assert.equal((await aanbod.POST(verzoek({ token: 'x', actie: 'accepteren' }))).status, 404);
    assert.equal((await aanbod.POST(verzoek({ token: TOKEN, actie: 'verwijderen' }))).status, 400);
    assert.equal((await bevestigen.POST(verzoek({ token: 12 }))).status, 404);
    assert.equal((await annuleren.POST(verzoek(null))).status, 404);
    assert.equal(rpcAanroepen.length, 0);
  });

  test('elke uitkomst uit de migratie heeft een Nederlandse tekst', () => {
    const aanbodUitkomsten = ['geaccepteerd', 'al_geaccepteerd', 'al_vergeven', 'al_afgewezen', 'afgewezen', 'verlopen', 'geannuleerd', 'afgemeld', 'niet_geaccepteerd', 'voorbij', 'niet_gevonden'];
    assert.deepEqual(Object.keys(proefles.AANBOD_MELDING).sort(), [...aanbodUitkomsten].sort());
    assert.deepEqual(Object.keys(proefles.INDIEN_MELDING).sort(), ['al_actief', 'niet_beschikbaar', 'ongeldig_tijdslot', 'ongeldige_gegevens', 'te_vaak', 'toestemming_ontbreekt']);
  });
});
