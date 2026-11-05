// Web-inschrijving met proefles-aan nodigt meteen uit voor de app (5 nov 2026).
//
// Aanleiding: een leerling schreef zich bij Rijschool 010 Rijbewijs in via het
// formulier, kwam op de wachtlijst met "Mag proefles plannen" aan (trigger in
// de database), en kreeg nooit de beloofde "tweede e-mail": het uitnodigpad
// hing in de app aan het aanzetten van een schakelaar die al aan stond.
//
// Twee lagen: de pure regels in lib/register-uitnodiging.ts, en de ECHTE route
// met nagebootste database, Resend en edge function.

import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBruikbaarEmailadres,
  moetUitnodigen,
  nodigUitViaServer,
  uitnodigingsRegelSchool,
  watGebeurtErNuHtml,
  UITNODIGING_BRON,
} from '../lib/register-uitnodiging.ts';

// ── De regels ───────────────────────────────────────────────────────────────

const basis = { nieuw: true, status: 'waitlist', mag_proefles_plannen: true, user_id: null, email: 'arda@voorbeeld.nl' };

describe('moetUitnodigen', () => {
  test('nieuwe wachtlijstrij met proefles-aan, zonder account, met adres: ja', () => {
    assert.equal(moetUitnodigen(basis), true);
  });

  test('de proefles-schakelaar staat uit (school wil eerst zelf kijken): nee', () => {
    assert.equal(moetUitnodigen({ ...basis, mag_proefles_plannen: false }), false);
    assert.equal(moetUitnodigen({ ...basis, mag_proefles_plannen: null }), false);
    assert.equal(moetUitnodigen({ ...basis, mag_proefles_plannen: undefined }), false);
  });

  test('een rij die de school al had (aangevuld, niet nieuw): nee', () => {
    // De school liet die rij bewust zonder uitnodiging staan (SEC003).
    assert.equal(moetUitnodigen({ ...basis, nieuw: false }), false);
  });

  test('al een account, of niet op de wachtlijst: nee', () => {
    assert.equal(moetUitnodigen({ ...basis, user_id: 'u-1' }), false);
    assert.equal(moetUitnodigen({ ...basis, status: 'active' }), false);
  });

  test('zonder bruikbaar e-mailadres: nee', () => {
    assert.equal(moetUitnodigen({ ...basis, email: '' }), false);
    assert.equal(moetUitnodigen({ ...basis, email: 'x@manual.ribba.app' }), false);
  });
});

describe('isBruikbaarEmailadres', () => {
  test('het nepdomein van handmatig ingevoerde leerlingen telt niet', () => {
    assert.equal(isBruikbaarEmailadres('iemand@manual.ribba.app'), false);
    assert.equal(isBruikbaarEmailadres('Iemand@MANUAL.RIBBA.APP'), false);
    assert.equal(isBruikbaarEmailadres('  '), false);
    assert.equal(isBruikbaarEmailadres(null), false);
    assert.equal(isBruikbaarEmailadres('arda@voorbeeld.nl'), true);
  });
});

describe('nodigUitViaServer', () => {
  function nepFetch(antwoord) {
    const aanroepen = [];
    const fetchFn = async (url, init) => {
      aanroepen.push({ url, init, body: JSON.parse(init.body) });
      if (antwoord instanceof Error) throw antwoord;
      return {
        ok: antwoord.status < 400,
        status: antwoord.status,
        json: async () => antwoord.body ?? {},
      };
    };
    return { fetchFn, aanroepen };
  }

  const opties = { supabaseUrl: 'https://proj.supabase.co/', serviceKey: 'sleutel', studentId: 's-1', email: 'arda@voorbeeld.nl' };

  test('roept invite-student-to-app aan als onze eigen server', async () => {
    const { fetchFn, aanroepen } = nepFetch({ status: 200, body: { success: true } });
    const uitkomst = await nodigUitViaServer({ ...opties, fetchFn });
    assert.deepEqual(uitkomst, { soort: 'uitgenodigd' });
    assert.equal(aanroepen.length, 1);
    assert.equal(aanroepen[0].url, 'https://proj.supabase.co/functions/v1/invite-student-to-app');
    assert.equal(aanroepen[0].init.method, 'POST');
    assert.equal(aanroepen[0].init.headers.Authorization, 'Bearer sleutel');
    assert.deepEqual(aanroepen[0].body, { studentId: 's-1', email: 'arda@voorbeeld.nl', bron: UITNODIGING_BRON });
  });

  test('een fout van de functie is een uitkomst, geen uitzondering', async () => {
    const { fetchFn } = nepFetch({ status: 502, body: { error: 'Resend 500: kapot' } });
    const uitkomst = await nodigUitViaServer({ ...opties, fetchFn });
    assert.equal(uitkomst.soort, 'mislukt');
    assert.equal(uitkomst.fout, '502: Resend 500: kapot');
  });

  test('een netwerkfout ook', async () => {
    const { fetchFn } = nepFetch(new TypeError('fetch failed'));
    const uitkomst = await nodigUitViaServer({ ...opties, fetchFn });
    assert.deepEqual(uitkomst, { soort: 'mislukt', fout: 'fetch failed' });
  });
});

describe('mailteksten', () => {
  test('uitgenodigd: de leerling weet dat de tweede mail nú komt', () => {
    const t = watGebeurtErNuHtml({ soort: 'uitgenodigd' });
    assert.match(t, /tweede e-mail/);
    assert.match(t, /proefles/);
    assert.doesNotMatch(t, /zodra je rijschool je activeert/i);
  });

  test('niet uitgenodigd: de bestaande belofte blijft', () => {
    const t = watGebeurtErNuHtml({ soort: 'niet' });
    assert.match(t, /Zodra je rijschool je activeert/);
    assert.match(t, /tweede e-mail/);
  });

  test('mislukt: de leerling leest dezelfde tekst als "niet" — de school regelt het', () => {
    assert.equal(watGebeurtErNuHtml({ soort: 'mislukt', fout: 'x' }), watGebeurtErNuHtml({ soort: 'niet' }));
  });

  test('de school leest wat er met de app-toegang is gebeurd', () => {
    assert.match(uitnodigingsRegelSchool({ soort: 'uitgenodigd' }), /uitnodiging voor de Ribba app ontvangen/);
    assert.match(uitnodigingsRegelSchool({ soort: 'mislukt', fout: 'x' }), /kon niet worden verstuurd/);
    assert.match(uitnodigingsRegelSchool({ soort: 'mislukt', fout: 'x' }), /Stuur inloglink/);
    assert.match(uitnodigingsRegelSchool({ soort: 'niet' }), /Bekijk en beheer/);
    // Geen foutdetails naar buiten: die staan in het serverlog.
    assert.doesNotMatch(uitnodigingsRegelSchool({ soort: 'mislukt', fout: 'Resend 500' }), /Resend/);
  });
});

// ── De echte route ──────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.RESEND_API_KEY = 're_test';

let bestaand = null;
let ingevoegdeRij = { mag_proefles_plannen: true, user_id: null };
let ingevoegd = [];
let functieAntwoord = { status: 200, body: { success: true } };
let functieAanroepen = [];
let mails = [];

mock.module('next/server', {
  namedExports: {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200, json: async () => body }) },
    NextRequest: class NextRequest {},
  },
});
mock.module('@/lib/rate-limit', { namedExports: { rateLimit: () => true } });
mock.module('@/lib/referral-attribution', { namedExports: { recordReferralAttribution: async () => {} } });

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from(tabel) {
        const api = {
          select: () => api,
          eq: () => api,
          is: () => api,
          limit: async () => ({ data: tabel === 'students' && bestaand ? [bestaand] : [] }),
          single: async () => (tabel === 'drivingschools'
            ? { data: { name: 'Rijschool A', email: 'info@school-a.nl' } }
            : { data: null }),
          update: () => ({ eq: () => ({ is: async () => ({ error: null }) }) }),
          insert(rij) {
            return {
              select: () => ({
                single: async () => {
                  ingevoegd.push({ tabel, rij });
                  return { data: { id: 's-nieuw', ...ingevoegdeRij }, error: null };
                },
              }),
            };
          },
        };
        return api;
      },
    }),
  },
});

const echteFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/')) {
    mails.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ id: 'nep-mail' }) };
  }
  if (u === 'https://proj.supabase.co/functions/v1/invite-student-to-app') {
    functieAanroepen.push({ init, body: JSON.parse(init.body) });
    return { ok: functieAntwoord.status < 400, status: functieAntwoord.status, json: async () => functieAntwoord.body };
  }
  return echteFetch(url, init);
};

const { POST } = await import('../app/api/register/route.ts');

function reset() {
  bestaand = null;
  ingevoegdeRij = { mag_proefles_plannen: true, user_id: null };
  ingevoegd = [];
  functieAntwoord = { status: 200, body: { success: true } };
  functieAanroepen = [];
  mails = [];
}

function verzoek(overrides = {}) {
  return {
    headers: { get: () => '203.0.113.' + Math.floor(Math.random() * 250) },
    json: async () => ({
      first_name: 'Arda', last_name: 'Test', email: 'Arda@Voorbeeld.nl', phone: '0612345678',
      address: 'Teststraat 1', postal_code: '1234AB', city: 'Rotterdam', license_type: 'B',
      date_of_birth: '2006-02-10', drivingschool_id: 'school-a',
      ...overrides,
    }),
  };
}

const leerlingMail = () => mails.find((m) => m.to === 'arda@voorbeeld.nl');
const schoolMail = () => mails.find((m) => m.to === 'info@school-a.nl');

describe('POST /api/register', () => {
  test('de fix: nieuwe wachtlijstrij met proefles-aan → uitnodiging, en beide mails zeggen het', async () => {
    reset();
    const res = await POST(verzoek());
    assert.equal(res.status, 200);
    assert.equal(ingevoegd.length, 1);
    assert.equal(ingevoegd[0].rij.status, 'waitlist');
    assert.equal(functieAanroepen.length, 1);
    assert.equal(functieAanroepen[0].init.headers.Authorization, 'Bearer test-service-role-key');
    assert.deepEqual(functieAanroepen[0].body, { studentId: 's-nieuw', email: 'arda@voorbeeld.nl', bron: 'web-inschrijving' });
    assert.equal(mails.length, 2);
    assert.match(leerlingMail().html, /Je krijgt zo een <strong>tweede e-mail<\/strong>/);
    assert.match(schoolMail().html, /uitnodiging voor de Ribba app ontvangen/);
  });

  test('de school heeft proefles voor nieuwe aanmeldingen uit → geen uitnodiging, oude tekst', async () => {
    reset();
    ingevoegdeRij = { mag_proefles_plannen: false, user_id: null };
    const res = await POST(verzoek());
    assert.equal(res.status, 200);
    assert.equal(functieAanroepen.length, 0);
    assert.match(leerlingMail().html, /Zodra je rijschool je activeert/);
    assert.match(schoolMail().html, /Bekijk en beheer deze inschrijving/);
  });

  test('een rij die de school al had wordt aangevuld, niet uitgenodigd', async () => {
    reset();
    bestaand = { id: 's-oud', user_id: null, status: 'waitlist', first_name: 'Arda', last_name: 'Test', phone: null, address: null, postal_code: null, city: null, license_type: 'B', date_of_birth: null };
    const res = await POST(verzoek());
    assert.equal(res.status, 200);
    assert.equal(ingevoegd.length, 0);
    assert.equal(functieAanroepen.length, 0);
    assert.match(schoolMail().html, /al in je leerlingenlijst stond/);
  });

  test('mislukt de uitnodiging, dan blijft de inschrijving staan en leest de school het', async () => {
    reset();
    functieAntwoord = { status: 502, body: { error: 'Resend 500: kapot' } };
    const res = await POST(verzoek());
    assert.equal(res.status, 200, 'de inschrijving is gelukt; de uitnodiging is een losse uitkomst');
    assert.equal(functieAanroepen.length, 1);
    assert.equal(mails.length, 2);
    assert.match(leerlingMail().html, /Zodra je rijschool je activeert/);
    assert.match(schoolMail().html, /kon niet worden verstuurd/);
    assert.doesNotMatch(schoolMail().html, /Resend/);
  });
});
