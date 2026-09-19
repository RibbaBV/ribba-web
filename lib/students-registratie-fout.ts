// Wat het publieke registratie-endpoint zegt als een e-mailadres al bekend is.
//
// DE PRIVACYREGEL
// ---------------
// Dit endpoint is publiek en valideert alleen het formaat van wat er binnenkomt.
// Wie het aanroept heeft níet bewezen dat hij de eigenaar is van het adres dat
// hij invult. Alles wat het antwoord verraadt over dat adres, verraadt het dus
// over een willekeurige derde.
//
// Daarom geven alle "dit adres is al bekend"-gevallen exact hetzelfde antwoord:
// dezelfde status, dezelfde tekst. Ook als de server intern prima weet of het
// om deze rijschool of een andere gaat.
//
// Waarom dat laatste ertoe doet: zou dezelfde school "al aangemeld bij deze
// rijschool" zeggen en een andere school "al bekend in Ribba", dan kan iemand
// uit het verschil alsnog afleiden bij wélke rijschool een adres hoort. Twee
// nette meldingen vormen samen het lek dat elk van beide apart niet is.
//
// NA VERIFICATIE MAG HET WEL
// --------------------------
// Dit is een regel voor het publieke pad vóór verificatie. Zodra een leerling
// via OTP heeft bewezen dat het adres van hem is, mag de app hem gewoon
// vertellen dat hij al aan een rijschool gekoppeld is — dan is het zijn eigen
// gegeven. Die specifieke melding hoort dus achter de inlog, niet hier.
//
// WAT DIT NIET OPLOST
// -------------------
// Een nieuw adres levert nog steeds 200 op en een bestaand adres 409. Dat
// verschil blijft bestaan en is op dit endpoint niet weg te nemen zonder de
// registratie zelf onbruikbaar te maken. Wat hier wél verdwijnt is de extra
// laag eroverheen: wie de 409 krijgt, weet alleen dát het adres bestaat, niet
// waar.

/**
 * De enige melding die dit endpoint geeft als een adres al bekend is.
 *
 * Gedeeld door alle gevallen, zodat ze niet uit elkaar kunnen lopen. Een
 * tweede tekst toevoegen naast deze is precies de fout die dit bestand
 * voorkomt.
 */
export const EMAIL_AL_BEKEND_MELDING =
  'Er bestaat al een Ribba-registratie met dit e-mailadres. Log in met dit ' +
  'adres of neem contact op als je er niet verder mee komt.';

/** Het publieke antwoord. 409: een conflict met bestaande gegevens, geen storing. */
export function emailAlBekendAntwoord(): { error: string; status: number } {
  return { error: EMAIL_AL_BEKEND_MELDING, status: 409 };
}

type SupabaseFout = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

/**
 * Herkent de botsing op de globale UNIQUE(email) van public.students.
 *
 * Eén e-mailadres kan maar één leerlingrij hebben in het hele platform, bij
 * welke rijschool en met welke status dan ook. Staat het adres al ergens, dan
 * eindigt de INSERT op SQLSTATE 23505. Dat is een conflict met bestaande
 * gegevens, geen storing, en opnieuw proberen lost het nooit op.
 *
 * Matcht op de SQLSTATE — de stabiele machine-interface — en niet op vrije
 * fouttekst. De constraintnaam dient alleen om een ándere unique op dezelfde
 * tabel door te laten naar de generieke afhandeling: zou die ook hier landen,
 * dan presenteert een toekomstige constraint zich als een productregel en
 * merken we dat nooit.
 */
export function isEmailAlBekendConflict(fout: SupabaseFout): boolean {
  if (!fout) return false;
  if (fout.code !== '23505') return false;

  const tekst = `${fout.message ?? ''} ${fout.details ?? ''}`;
  if (/students_\w*_key/.test(tekst) && !/students_email_key/.test(tekst)) {
    return false;
  }
  return true;
}
