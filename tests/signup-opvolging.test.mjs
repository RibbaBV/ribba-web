// Spoor 1b — selectie en inhoud van de opvolging bij een hangende Checkout.
// Puur: geen database, geen klok. De cronroute staat in
// tests/signup-reminders-route.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  HERINNERING_NA_UREN, TEAM_NA_UREN, VENSTER_DAGEN, HERVAT_URL,
  selecteerOpvolging, herinneringMail, teamOpvolgingInfo,
} = await import('../lib/signup-opvolging.ts');

const NU = new Date('2026-11-18T10:00:00Z');
const urenGeleden = (h) => new Date(NU.getTime() - h * 3_600_000).toISOString();
const rij = (over = {}) => ({
  id: 'pend-1', status: 'pending_checkout', school_name: 'Rijschool Marok',
  first_name: 'Mareas', last_name: 'Pinoras', email: 'test@voorbeeld.test', phone: '0644287534',
  city: 'Naaldwijk', plan: 'premium', promo_code: null, created_at: urenGeleden(30),
  reminder_sent_at: null, followup_notified_at: null,
  signup_attribution: { landing_page: '/registreren', referrer: 'https://ribba.nl/', utm_source: 'instantly', utm_campaign: 'nieuw' },
  ...over,
});

test('grenzen: 24 uur, 48 uur, 7 dagen', () => {
  assert.equal(HERINNERING_NA_UREN, 24);
  assert.equal(TEAM_NA_UREN, 48);
  assert.equal(VENSTER_DAGEN, 7);
});

test('S1: 30 uur oud → herinnering aan de school, nog geen teammelding', () => {
  const uit = selecteerOpvolging([rij()], NU);
  assert.equal(uit.herinneren.length, 1);
  assert.equal(uit.team.length, 0);
});

test('S2: 50 uur oud → herinnering én teammelding, allebei nog niet verstuurd', () => {
  const uit = selecteerOpvolging([rij({ created_at: urenGeleden(50) })], NU);
  assert.equal(uit.herinneren.length, 1);
  assert.equal(uit.team.length, 1);
});

test('S3: herinnering al verstuurd → alleen nog de teammelding', () => {
  const uit = selecteerOpvolging([rij({ created_at: urenGeleden(50), reminder_sent_at: urenGeleden(20) })], NU);
  assert.equal(uit.herinneren.length, 0);
  assert.equal(uit.team.length, 1);
});

test('S4: beide verstuurd → niets meer', () => {
  const uit = selecteerOpvolging([rij({ created_at: urenGeleden(60), reminder_sent_at: urenGeleden(30), followup_notified_at: urenGeleden(5) })], NU);
  assert.deepEqual(uit, { herinneren: [], team: [] });
});

test('S5: jonger dan 24 uur → nog niets', () => {
  const uit = selecteerOpvolging([rij({ created_at: urenGeleden(23) })], NU);
  assert.deepEqual(uit, { herinneren: [], team: [] });
});

test('S6: ouder dan 7 dagen → niets (Rijschool Urk krijgt geen mail van twee maanden later)', () => {
  const uit = selecteerOpvolging([rij({ created_at: urenGeleden(8 * 24) })], NU);
  assert.deepEqual(uit, { herinneren: [], team: [] });
});

test('S7: alleen pending_checkout — een betaalde of geactiveerde rij nooit', () => {
  for (const status of ['checkout_completed', 'activation_failed', 'activated']) {
    const uit = selecteerOpvolging([rij({ status, created_at: urenGeleden(50) })], NU);
    assert.deepEqual(uit, { herinneren: [], team: [] }, status);
  }
});

test('S8: zonder e-mailadres of met onleesbare datum → overgeslagen', () => {
  assert.deepEqual(selecteerOpvolging([rij({ email: null })], NU), { herinneren: [], team: [] });
  assert.deepEqual(selecteerOpvolging([rij({ created_at: 'gisteren' })], NU), { herinneren: [], team: [] });
});

test('M1: herinneringsmail noemt school, adres en de knop naar /registreren, en geen telefoonnummer', () => {
  const m = herinneringMail(rij());
  assert.equal(m.subject, 'Je inschrijving van Rijschool Marok bij Ribba staat nog open');
  assert.match(m.html, /Hoi Mareas,/);
  assert.match(m.html, /Rijschool Marok/);
  assert.match(m.html, /test@voorbeeld\.test/);
  assert.match(m.html, new RegExp(HERVAT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(m.html, /cal\.com\/ribba\/30min/);
  assert.match(m.html, /nog niets afgeschreven/);
  assert.doesNotMatch(m.html, /0644287534/);
});

test('M2: html in de schoolnaam wordt geëscapet', () => {
  const m = herinneringMail(rij({ school_name: '<b>Haak</b> & Co', first_name: null }));
  assert.doesNotMatch(m.html, /<b>Haak/);
  assert.match(m.html, /&lt;b&gt;Haak&lt;\/b&gt; &amp; Co/);
  assert.match(m.html, /Hallo,/);
});

test('T1: teammelding bevat contact, telefoon, herkomst, campagne en de stand van de herinnering', () => {
  const info = teamOpvolgingInfo(rij({ created_at: urenGeleden(50), reminder_sent_at: urenGeleden(26) }), NU);
  assert.equal(info.name, 'Rijschool Marok');
  assert.equal(info.email, 'test@voorbeeld.test');
  assert.equal(info.city, 'Naaldwijk');
  assert.equal(info.extra.Contact, 'Mareas Pinoras');
  assert.equal(info.extra.Telefoon, '0644287534');
  assert.equal(info.extra['Open sinds'], '50 uur');
  assert.equal(info.extra.Herkomst, '/registreren');
  assert.equal(info.extra.Verwijzer, 'https://ribba.nl/');
  assert.equal(info.extra.Campagne, 'instantly / nieuw');
  assert.match(info.extra.Herinnering, /^aan de rijschool verstuurd op /);
  assert.match(info.extra.Status, /Bellen\?/);
});

test('T2: zonder herinnering en zonder herkomst blijven die regels weg of eerlijk', () => {
  const info = teamOpvolgingInfo(rij({ created_at: urenGeleden(49), signup_attribution: null }), NU);
  assert.equal(info.extra.Herinnering, 'nog niet aan de rijschool verstuurd');
  assert.equal(info.extra.Herkomst, undefined);
  assert.equal(info.extra.Campagne, undefined);
});
