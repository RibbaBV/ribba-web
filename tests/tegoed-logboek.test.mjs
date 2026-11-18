// Tegoedlogboek in het supportportaal (stap 3, 12 nov 2026).
// Als deze tests omvallen: de pagina vraagt geen reden meer, de route zit niet
// meer achter eigenaar + niveau 2, of de oorzaken uit de database worden
// onleesbaar getoond.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { doorLabel, hoeveelheid, oorzaakLabel, parseTegoedVerzoek, verschil } from '../lib/tegoed-logboek.ts';

const reden = 'nagaan waarom het potje negatief staat';
const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

test('verzoek: zoeken vraagt 2+ tekens en een reden van 10+ tekens', () => {
  assert.deepEqual(parseTegoedVerzoek({ modus: 'zoek', query: '  Damian ', reason: ` ${reden} ` }), { modus: 'zoek', query: 'Damian', reason: reden });
  assert.equal(parseTegoedVerzoek({ modus: 'zoek', query: 'D', reason: reden }), null);
  assert.equal(parseTegoedVerzoek({ modus: 'zoek', query: 'x'.repeat(101), reason: reden }), null);
  assert.equal(parseTegoedVerzoek({ modus: 'zoek', query: 'Damian', reason: 'kort' }), null);
  assert.equal(parseTegoedVerzoek({ modus: 'zoek', query: 'Damian' }), null);
  assert.equal(parseTegoedVerzoek({ modus: 'zoek', query: 'Damian', reason: 'x'.repeat(301) }), null);
});

test('verzoek: logboek alleen met een geldig leerling-id', () => {
  assert.deepEqual(parseTegoedVerzoek({ modus: 'logboek', student_id: id.toUpperCase(), reason: reden }), { modus: 'logboek', student_id: id, reason: reden });
  assert.equal(parseTegoedVerzoek({ modus: 'logboek', student_id: 'abc', reason: reden }), null);
  assert.equal(parseTegoedVerzoek({ modus: 'iets', reason: reden }), null);
  assert.equal(parseTegoedVerzoek(null), null);
});

test('oorzaken uit stap 2 in gewone woorden', () => {
  assert.equal(oorzaakLabel('les_afgerond'), 'Les afgerond');
  assert.equal(oorzaakLabel('les_geannuleerd_teruggave'), 'Les geannuleerd · tegoed terug');
  assert.equal(oorzaakLabel('les_status_no_show'), 'Lesstatus gewijzigd (no_show)');
  assert.equal(oorzaakLabel('rpc:grant_package_credit_for_invoice'), 'Factuur betaald · pakket bijgeschreven');
  assert.equal(oorzaakLabel('rpc:nieuwe_functie'), 'Functie nieuwe_functie');
  assert.equal(oorzaakLabel('app_direct'), 'Handmatig aangepast in de app');
  assert.equal(oorzaakLabel('sql_direct'), 'Rechtstreeks in de database (correctie)');
  assert.equal(oorzaakLabel('api:lessons'), 'Via de app (lessons)');
  assert.equal(oorzaakLabel('iets_nieuws'), 'iets_nieuws');
});

test('hoeveelheden: minuten, en telpotjes als aantal', () => {
  assert.equal(hoeveelheid(150, 'time', 50), '150 min');
  assert.equal(hoeveelheid(-50, 'time', 50), '-50 min');
  assert.equal(hoeveelheid(100, 'count', 50), '2×');
  assert.equal(hoeveelheid(70, 'count', 50), '70 min');
  assert.equal(hoeveelheid(100, 'count', null), '100 min');
  assert.equal(hoeveelheid(null, 'time', 50), '—');
  assert.equal(verschil(600, 550), -50);
  assert.equal(verschil(600, 600), null);
  assert.equal(verschil(null, 50), null);
  assert.equal(doorLabel({ door_naam: null, door_rol: 'postgres' }), 'Database (SQL of cron)');
  assert.equal(doorLabel({ door_naam: 'Önder', door_rol: 'authenticated' }), 'Önder');
});

test('route: alleen eigenaar, niveau 2, met reden en leerling in het toegangslogboek', () => {
  const src = readFileSync('app/api/support/dashboard/tegoed/route.ts', 'utf8');
  assert.match(src, /action: 'owner\.tegoed\.read', ownerOnly: true, level: 2, reason: input\.reason, targetType: 'student_credit', targetStudentId: input\.student_id/);
  assert.match(src, /action: 'owner\.tegoed\.search', ownerOnly: true, level: 2, reason: input\?\.reason/);
  assert.match(src, /export async function POST/);
  assert.doesNotMatch(src, /export async function GET/);
  assert.match(src, /rpc\('support_tegoed_logboek', \{ p_actor: user\.id/);
  assert.match(src, /rpc\('support_tegoed_zoek', \{ p_actor: user\.id/);
});

test('pagina: reden verplicht vóór zoeken en openen; link in het eigenaarsmenu', () => {
  const page = readFileSync('app/(support)/support/dashboard/tegoed/page.tsx', 'utf8');
  assert.match(page, /Reden voor inzage<input[^\n]*?minLength=\{10\}[^\n]*?required/);
  assert.match(page, /disabled=\{!redenOk\|\|query\.trim\(\)\.length<2/);
  assert.match(page, /disabled=\{!redenOk\} onClick=\{\(\)=>open\(r\.student_id\)\}/);
  const shell = readFileSync('app/(support)/support/support-shell.tsx', 'utf8');
  assert.match(shell, /href="\/support\/dashboard\/tegoed"[^>]*>Tegoed<\/Link>/);
});
