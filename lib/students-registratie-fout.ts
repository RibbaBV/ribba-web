// Waarom de inschrijving van een leerling kan mislukken, en wat we daar dan
// over zeggen.
//
// DE AANLEIDING
// -------------
// public.students heeft een globale UNIQUE(email): één e-mailadres kan maar
// één leerlingrij hebben in het hele platform, bij welke rijschool en met
// welke status dan ook. Wie al bij rijschool A staat — ook als die relatie
// jaren geleden is afgerond — kan zich via dit formulier niet bij rijschool B
// inschrijven. De INSERT eindigt dan op SQLSTATE 23505.
//
// Tot nu toe kwam daar "Er ging iets mis bij het opslaan. Probeer het opnieuw."
// uit, met status 500. Beide kloppen niet: er ging niets mis aan onze kant, en
// opnieuw proberen loopt op precies dezelfde constraint vast.
//
// DEZELFDE TEKST ALS IN DE APP
// ----------------------------
// De Ribba-app vertaalt dezelfde situatie via de sleutel
// 'reeds_leerling_bij_andere_rijschool' uit de join_school-RPC. Die route
// loopt hier niet doorheen — dit formulier schrijft rechtstreeks — dus de
// herkenning zit op twee plekken. Bewuste keuze: één gedeelde RPC zou een
// herontwerp van dit hele registratiepad vragen, en dat hoort bij 0D waar de
// constraint zelf op de schop gaat. Wat wél gedeeld is, is de tekst die de
// gebruiker leest.
//
// WAT DE TEKST NIET ZEGT
// ----------------------
// Niet "beëindig eerst je huidige rijschool". De botsing kan net zo goed op
// een afgeronde relatie slaan, en dan is dat advies niet uit te voeren.

/** De melding die de gebruiker leest. Gelijk aan die in de Ribba-app. */
export const REEDS_LEERLING_MELDING =
  'Je staat al bij een andere rijschool in Ribba. Koppelen aan meerdere ' +
  'rijscholen wordt op dit moment nog niet ondersteund.';

type SupabaseFout = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

/**
 * Herkent de e-mailbotsing op students.
 *
 * Matcht primair op SQLSTATE 23505 — dat is de stabiele machine-interface.
 * De constraintnaam wordt alleen gebruikt om andere unique violations op
 * dezelfde tabel niet per ongeluk mee te nemen; staat er geen naam in de
 * foutdetails, dan is 23505 op dit insertpad hoe dan ook een e-mailbotsing,
 * want het is de enige unique die deze rij kan schenden.
 */
export function isBestaandeLeerlingElders(fout: SupabaseFout): boolean {
  if (!fout) return false;
  if (fout.code !== '23505') return false;

  const tekst = `${fout.message ?? ''} ${fout.details ?? ''}`;
  // Een andere unique op students zou hier een verkeerde melding opleveren;
  // noemt de fout een constraint die niet over e-mail gaat, dan laten we hem
  // door naar de generieke afhandeling.
  if (/students_\w*_key/.test(tekst) && !/students_email_key/.test(tekst)) {
    return false;
  }
  return true;
}

/** Het antwoord dat de API teruggeeft bij deze situatie. */
export function bestaandeLeerlingAntwoord(): { error: string; status: number } {
  // 409 en niet 500: dit is een conflict met bestaande gegevens, geen storing.
  // Dezelfde status die deze route al gebruikt voor "al aangemeld bij deze
  // rijschool".
  return { error: REEDS_LEERLING_MELDING, status: 409 };
}
