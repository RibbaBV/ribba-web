// Gebruik van de app — gedeelde types en weergaveregels voor de supportpagina
// /support/gebruik (10 nov 2026).
//
// De gegevens komen uit support_app_gebruik() in ribbaPro (migratie
// 20261110220000). Die geeft ALLEEN aantallen: nooit wie wat deed.

export const periodes = [7, 30, 90] as const;
export type Periode = (typeof periodes)[number];

/** Alleen 7, 30 of 90; alles anders wordt 30. */
export function parsePeriode(waarde: string | null | undefined): Periode {
  const n = Number(waarde);
  return (periodes as readonly number[]).includes(n) ? (n as Periode) : 30;
}

export type AppGebruik = {
  dagen: number;
  totaal: { gebeurtenissen: number; gebruikers: number };
  per_rol: { rol: string; gebruikers: number }[];
  per_dag: { dag: string; rol: string; gebruikers: number }[];
  schermen: { rol: string; scherm: string; keer: number; gebruikers: number }[];
  knoppen: { rol: string; scherm: string | null; element: string | null; keer: number; gebruikers: number }[];
  trechter_les: { gezien: number; tikte: number; planscherm: number };
  trechter_proefles: { tikte: number; planscherm: number };
};

export const rolLabels: Record<string, string> = {
  leerling: 'Leerling',
  instructeur: 'Instructeur',
  beheerder: 'Beheerder',
  eigenaar: 'Eigenaar',
  ouder: 'Ouder',
  onbekend: 'Onbekend',
};
export const rolLabel = (rol: string) => rolLabels[rol] ?? rol;

/** Schermnamen zijn routenamen uit de app; een paar vertalen we voor leesbaarheid. */
const schermLabels: Record<string, string> = {
  StudentDashboard: 'Home (leerling)',
  StudentPraktijk: 'Praktijk',
  StudentMijnPlanning: 'Mijn planning',
  StudentLesAanvraag: 'Les plannen (planscherm)',
  StudentBeschikbaarheid: 'Beschikbaarheid doorgeven',
  StudentLesDetail: 'Lesdetail (leerling)',
  StudentVoortgang: 'Voortgang',
  StudentShop: 'Winkel',
  Login: 'Inloggen',
};
export const schermLabel = (scherm: string | null) => (scherm ? schermLabels[scherm] ?? scherm : '—');

/**
 * Knopnamen zijn een testID ("home-les-plannen"), een vertaalsleutel
 * ("tekst:studentPraktijk.lesPlannen") of "knop" / "knop:<rol>" als de app geen
 * vaste naam vond. We tonen ze zoals ze zijn, met een korte uitleg.
 */
export function knopLabel(element: string | null): { naam: string; soort: string } {
  if (!element) return { naam: '—', soort: '' };
  if (element.startsWith('tekst:')) return { naam: element.slice(6), soort: 'tekst' };
  if (element === 'invoerveld') return { naam: 'Invoerveld', soort: 'veld' };
  if (element === 'knop' || element.startsWith('knop:')) return { naam: 'Knop zonder vaste naam', soort: 'onbekend' };
  return { naam: element, soort: 'id' };
}

/** Percentage als geheel getal, of "—" bij nul in de noemer. */
export function procent(teller: number, noemer: number): string {
  return noemer > 0 ? `${Math.round((teller / noemer) * 100)}%` : '—';
}

/** Actieve gebruikers per dag (alle rollen samen), voor de grafiek. */
export function gebruikersPerDag(rijen: AppGebruik['per_dag']): { dag: string; gebruikers: number }[] {
  const per = new Map<string, number>();
  for (const r of rijen) per.set(r.dag, (per.get(r.dag) ?? 0) + r.gebruikers);
  return [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dag, gebruikers]) => ({ dag, gebruikers }));
}
