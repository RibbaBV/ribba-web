// Wat het publieke registratie-endpoint prijsgeeft over een e-mailadres.
//
// Aanleiding (20 sep 2026): public.students heeft een globale UNIQUE(email).
// Wie al bij rijschool A staat kan zich via dit formulier niet bij rijschool B
// inschrijven; de INSERT eindigde op SQLSTATE 23505 en de gebruiker las "Er
// ging iets mis bij het opslaan. Probeer het opnieuw." met status 500. Beide
// onwaar: er ging niets mis aan onze kant, en opnieuw proberen loopt op precies
// dezelfde constraint vast.
//
// De eerste oplossing zei erbij dát het om een andere rijschool ging. Dat is in
// review afgekeurd, en terecht: dit endpoint is publiek en de aanvrager heeft
// niet bewezen dat het adres van hem is. Hij zou dus over een willekeurige
// derde te weten komen bij welke rijschool die hoort.
//
// De regel is nu: alle "al bekend"-gevallen geven exact hetzelfde antwoord.
// Ook het geval dat al vóór deze wijziging bestond — "al aangemeld bij deze
// rijschool" — want twee nette meldingen vormen samen het lek dat elk van
// beide apart niet is.
//
// Na OTP-verificatie mag de app wél specifiek zijn. Dat hoort achter de inlog.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isEmailAlBekendConflict,
  emailAlBekendAntwoord,
  EMAIL_AL_BEKEND_MELDING,
} from '../lib/students-registratie-fout.ts';

const route = readFileSync(new URL('../app/api/register/route.ts', import.meta.url), 'utf8');

describe('privacy: beide bekende-e-mailgevallen zijn niet te onderscheiden', () => {
  test('de route bevat geen enkele eigen tekst over een bekend e-mailadres', () => {
    // De oude meldingen, allebei. Staat er één terug, dan is het onderscheid
    // terug en is deze hele maatregel weg.
    assert.doesNotMatch(route, /al aangemeld bij deze rijschool/i);
    assert.doesNotMatch(route, /andere rijschool/i);
    assert.doesNotMatch(route, /al bekend in Ribba/i);
  });

  test('beide 409-paden lopen via dezelfde helper', () => {
    // Twee aanroepen: de same-school-tak en de conflict-tak na de INSERT.
    const aanroepen = route.match(/emailAlBekendAntwoord\(\)/g) ?? [];
    assert.equal(
      aanroepen.length,
      2,
      'verwacht precies twee aanroepen: same-school en het unique-conflict',
    );
  });

  test('de route bouwt nergens zelf een 409 met een eigen boodschap', () => {
    // Een handgeschreven `status: 409` naast de helper zou een tweede,
    // afwijkend antwoord kunnen introduceren.
    const losse409 = route.match(/status:\s*409/g) ?? [];
    assert.equal(losse409.length, 0, 'elke 409 hoort uit emailAlBekendAntwoord() te komen');
  });

  test('de melding noemt geen rijschool, niet deze en niet een andere', () => {
    assert.doesNotMatch(EMAIL_AL_BEKEND_MELDING, /rijschool/i);
    assert.doesNotMatch(EMAIL_AL_BEKEND_MELDING, /deze school|andere school/i);
  });
});

describe('isEmailAlBekendConflict', () => {
  test('W3 — herkent de botsing op de globale e-mail-unique', () => {
    assert.equal(
      isEmailAlBekendConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint "students_email_key"',
        details: 'Key (email)=(leerling@example.test) already exists.',
      }),
      true,
    );
  });

  test('herkent 23505 ook zonder constraintnaam in de tekst', () => {
    // Op dit insertpad is de e-mail-unique de enige die deze rij kan schenden.
    assert.equal(isEmailAlBekendConflict({ code: '23505', message: '' }), true);
  });

  test('laat een andere unique op students met rust', () => {
    // Zou er ooit een tweede unique bijkomen, dan hoort die niet als
    // "al bekend" gepresenteerd te worden maar als storing op te vallen.
    assert.equal(
      isEmailAlBekendConflict({
        code: '23505',
        message: 'duplicate key value violates unique constraint "students_plango_id_key"',
      }),
      false,
    );
  });

  test('W5 — een echte storing blijft een storing', () => {
    // De belangrijkste tegenproef: als elke fout hier zou landen, zou een
    // kapotte database zich voordoen als een nette productregel.
    assert.equal(isEmailAlBekendConflict({ code: '08006', message: 'connection failure' }), false);
    assert.equal(isEmailAlBekendConflict({ code: '23503', message: 'foreign key' }), false);
    assert.equal(isEmailAlBekendConflict(null), false);
    assert.equal(isEmailAlBekendConflict(undefined), false);
  });
});

describe('emailAlBekendAntwoord', () => {
  test('geeft 409, geen 500', () => {
    // Een conflict met bestaande gegevens is geen serverstoring.
    assert.equal(emailAlBekendAntwoord().status, 409);
  });

  test('geeft altijd dezelfde tekst terug', () => {
    assert.equal(emailAlBekendAntwoord().error, EMAIL_AL_BEKEND_MELDING);
    assert.equal(emailAlBekendAntwoord().error, emailAlBekendAntwoord().error);
  });

  test('wijst de gebruiker een weg vooruit', () => {
    // Neutraal mag niet betekenen: onbruikbaar. Wie dit leest moet weten wat
    // hij nu kan doen.
    assert.match(EMAIL_AL_BEKEND_MELDING, /log in/i);
  });

  test('belooft geen nieuwe poging', () => {
    assert.doesNotMatch(EMAIL_AL_BEKEND_MELDING, /opnieuw/i);
  });
});
