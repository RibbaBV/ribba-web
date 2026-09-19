// De melding die een leerling krijgt als zijn e-mailadres al bij een andere
// rijschool in Ribba staat.
//
// Aanleiding (19 sep 2026): public.students heeft een globale UNIQUE(email).
// Wie al bij rijschool A staat — ook met een relatie die jaren geleden is
// afgerond — kan zich via dit formulier niet bij rijschool B inschrijven. De
// INSERT eindigde dan op SQLSTATE 23505 en de gebruiker las "Er ging iets mis
// bij het opslaan. Probeer het opnieuw." met status 500.
//
// Beide zijn onwaar: er ging niets mis aan onze kant, en opnieuw proberen
// loopt op exact dezelfde constraint vast. Deze tests bewaken dat de fout
// herkend wordt, dat de tekst gelijk is aan die in de Ribba-app, en — net zo
// belangrijk — dat een échte storing niet stilletjes als dit conflict wordt
// weggeschreven.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBestaandeLeerlingElders,
  bestaandeLeerlingAntwoord,
  REEDS_LEERLING_MELDING,
} from '../lib/students-registratie-fout.ts';

describe('isBestaandeLeerlingElders', () => {
  test('W3 — herkent de e-mailbotsing op students', () => {
    assert.equal(
      isBestaandeLeerlingElders({
        code: '23505',
        message: 'duplicate key value violates unique constraint "students_email_key"',
        details: 'Key (email)=(leerling@example.test) already exists.',
      }),
      true,
    );
  });

  test('herkent 23505 ook zonder constraintnaam in de tekst', () => {
    // Op dit insertpad is de e-mail-unique de enige die deze rij kan schenden,
    // dus een kale 23505 hoort hier thuis in plaats van bij "er ging iets mis".
    assert.equal(isBestaandeLeerlingElders({ code: '23505', message: '' }), true);
  });

  test('laat een andere unique op students met rust', () => {
    // Zou er ooit een tweede unique bijkomen, dan hoort die niet als
    // "je staat al bij een andere rijschool" gepresenteerd te worden.
    assert.equal(
      isBestaandeLeerlingElders({
        code: '23505',
        message: 'duplicate key value violates unique constraint "students_plango_id_key"',
      }),
      false,
    );
  });

  test('W5 — een echte storing blijft een storing', () => {
    // De belangrijkste tegenproef: als elke fout hier zou landen, zou een
    // kapotte database zich voordoen als een nette productregel en zouden we
    // dat nooit merken.
    assert.equal(isBestaandeLeerlingElders({ code: '08006', message: 'connection failure' }), false);
    assert.equal(isBestaandeLeerlingElders({ code: '23503', message: 'foreign key' }), false);
    assert.equal(isBestaandeLeerlingElders(null), false);
    assert.equal(isBestaandeLeerlingElders(undefined), false);
  });
});

describe('bestaandeLeerlingAntwoord', () => {
  test('geeft 409, geen 500', () => {
    // Een conflict met bestaande gegevens is geen serverstoring. 409 is ook de
    // status die deze route al gebruikt voor "al aangemeld bij deze rijschool".
    assert.equal(bestaandeLeerlingAntwoord().status, 409);
  });

  test('gebruikt exact dezelfde tekst als de Ribba-app', () => {
    assert.equal(bestaandeLeerlingAntwoord().error, REEDS_LEERLING_MELDING);
    assert.match(REEDS_LEERLING_MELDING, /al bij een andere rijschool/);
  });

  test('zegt bewust niet dat de bestaande relatie actief is', () => {
    // De globale unique botst net zo hard op een afgeronde relatie. "Beëindig
    // eerst je huidige rijschool" zou dan onuitvoerbaar advies zijn.
    assert.doesNotMatch(REEDS_LEERLING_MELDING, /beëindig|huidige rijschool/i);
  });

  test('belooft geen nieuwe poging', () => {
    assert.doesNotMatch(REEDS_LEERLING_MELDING, /opnieuw/i);
  });
});
