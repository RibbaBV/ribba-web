// Wat het publieke registratie-endpoint doet met een leerlingrij die de
// rijschool al had aangemaakt (nog zonder account).
//
// SEC003 (securityaudit 27 okt 2026)
// ----------------------------------
// Dit endpoint is publiek: wie het aanroept heeft alleen een e-mailadres en
// een rijschool-ID nodig, en heeft niet bewezen dat het adres van hem is.
// Tot nu toe overschreef het formulier dan naam, telefoon, adres,
// geboortedatum en rijbewijs van die bestaande leerling, en zette het de
// status op 'waitlist'. Een vreemde kon zo de gegevens van een echte leerling
// veranderen, of een actieve leerling op de wachtlijst zetten.
//
// DE REGEL
// --------
// - Een veld dat de rijschool al heeft ingevuld, blijft staan.
// - Een leeg veld mag het formulier aanvullen. Zo blijft de route werken
//   waarvoor hij bedoeld is: de school maakt een leerling aan met alleen een
//   e-mailadres en de leerling vult zelf de rest in.
// - De status verandert nooit. Dat is een beslissing van de rijschool.
// - Wat afwijkt, krijgt de rijschool te zien in de meldingsmail. De school
//   beslist zelf of ze iets overneemt.

export type Leerlinggegevens = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  license_type: string;
  date_of_birth: string;
};

export type BestaandeLeerling = Partial<Record<keyof Leerlinggegevens, string | null>> & {
  status?: string | null;
};

export const VELDLABELS: Record<keyof Leerlinggegevens, string> = {
  first_name: 'Voornaam',
  last_name: 'Achternaam',
  phone: 'Telefoon',
  address: 'Adres',
  postal_code: 'Postcode',
  city: 'Plaats',
  license_type: 'Rijbewijs',
  date_of_birth: 'Geboortedatum',
};

const VELDEN = Object.keys(VELDLABELS) as (keyof Leerlinggegevens)[];

function leeg(waarde: string | null | undefined): boolean {
  return waarde == null || waarde.trim() === '';
}

function gelijk(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type Verschil = {
  veld: keyof Leerlinggegevens;
  bestaand: string;
  ingevuld: string;
};

/**
 * Bepaalt wat het formulier aan een bestaande leerlingrij mag veranderen.
 *
 * `aanvulling` bevat alleen velden die in de rij leeg waren; nooit `status`.
 * `verschillen` zijn velden die de school al had en die anders zijn ingevuld.
 * Die worden niet opgeslagen, alleen gemeld.
 */
export function aanvullingVoorBestaandeLeerling(
  bestaand: BestaandeLeerling,
  ingevuld: Leerlinggegevens,
): { aanvulling: Partial<Leerlinggegevens>; verschillen: Verschil[] } {
  const aanvulling: Partial<Leerlinggegevens> = {};
  const verschillen: Verschil[] = [];

  for (const veld of VELDEN) {
    const oud = bestaand[veld];
    const nieuw = ingevuld[veld];
    if (leeg(nieuw)) continue;
    if (leeg(oud)) {
      aanvulling[veld] = nieuw;
    } else if (!gelijk(oud as string, nieuw)) {
      verschillen.push({ veld, bestaand: oud as string, ingevuld: nieuw });
    }
  }

  return { aanvulling, verschillen };
}

const STATUSLABELS: Record<string, string> = {
  waitlist: 'Wachtlijst',
  active: 'Actief',
  inactive: 'Inactief',
  graduated: 'Geslaagd',
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Wachtlijst';
  return STATUSLABELS[status] ?? status;
}
