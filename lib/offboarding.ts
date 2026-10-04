// Wat een rijschool bij opzeggen te horen krijgt (A4, 4 okt 2026).
//
// Besluit Önder (4 okt 2026): na echt opzeggen heeft de school 30 dagen om
// alles te downloaden; daarna verwijdert Ribba alles van de rijschool en
// bewaart geen kopie (alleen Ribba's eigen facturen aan de school).
//
// BRON VAN WAARHEID: ribbaPro `supabase/functions/_shared/offboarding.ts`
// (termijn, verwijderdag, woorden). Deze repo kan die niet importeren; dit is
// een kopie van alleen wat mijn.ribba.app nodig heeft. Pas beide samen aan,
// net als bij lib/legal-versions.ts.

export const DOWNLOAD_DAGEN = 30;

const NL_DELEN = new Intl.DateTimeFormat('nl-NL', {
  timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'numeric', year: 'numeric',
});
const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

/** De verwijderdag als "30 november 2026": Nederlandse kalenderdag van het einde + 30. */
export function verwijderdagLang(eindIso: string | null | undefined): string | null {
  if (!eindIso) return null;
  const d = new Date(eindIso);
  if (Number.isNaN(d.getTime())) return null;
  const deel: Record<string, number> = {};
  for (const p of NL_DELEN.formatToParts(d)) if (p.type !== 'literal') deel[p.type] = Number(p.value);
  const w = new Date(Date.UTC(deel.year, deel.month - 1, deel.day + DOWNLOAD_DAGEN));
  return `${w.getUTCDate()} ${MAANDEN[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

/** De tekst in het opzegvenster (door Önder goedgekeurd, 4 okt 2026). */
export const OPZEGGEN_TEKST =
  `Je houdt toegang tot het einde van je betaalperiode. Daarna heb je nog ${DOWNLOAD_DAGEN} dagen om je gegevens te downloaden. ` +
  'Daarna verwijdert Ribba alles van je rijschool: facturen, leerlingen en lessen. Ribba bewaart geen kopie.\n\n' +
  'Je bent zelf verplicht je facturen 7 jaar te bewaren. Download ze op tijd in de app via Instellingen → Alles downloaden.';

/** De zin onder "Je abonnement is opgezegd" als de einddatum bekend is. */
export function naOpzeggenTekst(eindIso: string | null | undefined): string | null {
  const weg = verwijderdagLang(eindIso);
  if (!weg) return null;
  return `Download je gegevens in de app vóór ${weg}; daarna verwijdert Ribba alles van je rijschool.`;
}
