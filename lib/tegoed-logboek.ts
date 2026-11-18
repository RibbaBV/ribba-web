// Tegoedlogboek in het supportportaal (stap 3, 12 nov 2026).
//
// Leest via ribbaPro 20261112090000_support_tegoed_logboek:
//   support_tegoed_zoek(actor, zoekterm)
//   support_tegoed_logboek(actor, leerling, limiet)
// Alleen de platformeigenaar, met tweefactor en een inzagereden (niveau 2).
// Zoekterm en leerling-id gaan in de POST-body, niet in de URL.

export const LIMIET = 200;

export interface TegoedZoekRij {
  student_id: string; naam: string; email: string | null; status: string | null;
  school_id: string; school: string; potjes: number; logregels: number;
}

export interface TegoedPotje {
  bucket_id: string; potje: string; eenheid: string; per_eenheid: number | null;
  vrij: number; gepland: number; gebruikt: number; gekocht: number;
}

export interface TegoedRegel {
  id: number; tijd: string; bucket_id: string; potje: string; eenheid: string;
  actie: 'aangemaakt' | 'gewijzigd' | 'verwijderd';
  vrij_voor: number | null; vrij_na: number | null;
  gepland_voor: number | null; gepland_na: number | null;
  gebruikt_voor: number | null; gebruikt_na: number | null;
  gekocht_voor: number | null; gekocht_na: number | null;
  oorzaak: string; route: string | null; reden: string | null; factuur_id: string | null;
  via_trigger: boolean; door_rol: string; door_naam: string | null; les_id: string | null;
  les: { datum: string; start: string | null; duur: number | null; status: string | null; type: string | null } | null;
}

export interface TegoedLogboek {
  leerling: { student_id: string; naam: string; email: string | null; status: string | null; school_id: string; school: string };
  logboek_sinds: string | null;
  potjes: TegoedPotje[];
  totaal: number;
  regels: TegoedRegel[];
}

export type TegoedVerzoek =
  | { modus: 'zoek'; query: string; reason: string }
  | { modus: 'logboek'; student_id: string; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Controleert het verzoek; zonder geldige reden (10–300 tekens) geen inzage. */
export function parseTegoedVerzoek(value: unknown): TegoedVerzoek | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.reason !== 'string' || v.reason.trim().length < 10 || v.reason.length > 300) return null;
  const reason = v.reason.trim();
  if (v.modus === 'zoek') {
    if (typeof v.query !== 'string') return null;
    const query = v.query.trim();
    if (query.length < 2 || query.length > 100) return null;
    return { modus: 'zoek', query, reason };
  }
  if (v.modus === 'logboek') {
    if (typeof v.student_id !== 'string' || !UUID.test(v.student_id)) return null;
    return { modus: 'logboek', student_id: v.student_id.toLowerCase(), reason };
  }
  return null;
}

const LES: Record<string, string> = {
  les_gepland: 'Les gepland',
  les_afgerond: 'Les afgerond',
  les_geannuleerd: 'Les geannuleerd',
  les_geannuleerd_teruggave: 'Les geannuleerd · tegoed terug',
  les_geannuleerd_kosten: 'Les geannuleerd · in rekening gebracht',
  les_heropend: 'Les weer op gepland gezet',
  les_andere_leerling: 'Les naar een andere leerling',
  les_ander_lestype: 'Lestype van de les gewijzigd',
  les_duur_gewijzigd: 'Duur van de les gewijzigd',
  les_tegoedkeuze_gewijzigd: 'Tegoedkeuze bij de les gewijzigd',
  les_gewijzigd: 'Les gewijzigd',
  les_verwijderd: 'Les verwijderd',
  les_aangemaakt: 'Les aangemaakt',
};

const RPC: Record<string, string> = {
  grant_package_credit_for_invoice: 'Factuur betaald · pakket bijgeschreven',
  revoke_package_credit_for_invoice: 'Factuur teruggedraaid · pakket afgeschreven',
  add_exam_credit_by_type: 'Examen toegevoegd',
  subtract_exam_credit_by_type: 'Examen afgehaald',
  recompute_student_bucket: 'Potje herberekend',
};

/** Wat er gebeurde, in gewone woorden. Onbekende codes blijven leesbaar. */
export function oorzaakLabel(oorzaak: string): string {
  if (LES[oorzaak]) return LES[oorzaak];
  if (oorzaak.startsWith('les_status_')) return `Lesstatus gewijzigd (${oorzaak.slice('les_status_'.length)})`;
  if (oorzaak.startsWith('rpc:')) {
    const f = oorzaak.slice(4);
    return RPC[f] ?? `Functie ${f}`;
  }
  if (oorzaak.startsWith('api:')) return `Via de app (${oorzaak.slice(4)})`;
  switch (oorzaak) {
    case 'app_direct': return 'Handmatig aangepast in de app';
    case 'sql_direct': return 'Rechtstreeks in de database (correctie)';
    case 'handmatig': return 'Handmatig';
    case 'onbekend': return 'Onbekend';
    default: return oorzaak;
  }
}

/** Minuten tonen; bij een telpotje (examen, toets) als aantal. */
export function hoeveelheid(minuten: number | null, eenheid: string, perEenheid: number | null): string {
  if (minuten === null) return '—';
  if (eenheid === 'count' && perEenheid && perEenheid > 0 && minuten % perEenheid === 0) return `${minuten / perEenheid}×`;
  return `${minuten} min`;
}

/** Verschil na − voor met teken, of null als er niets veranderde of een kant ontbreekt. */
export function verschil(voor: number | null, na: number | null): number | null {
  if (voor === null || na === null || voor === na) return null;
  return na - voor;
}

/** Wie of wat de wijziging deed. */
export function doorLabel(r: Pick<TegoedRegel, 'door_naam' | 'door_rol'>): string {
  if (r.door_naam) return r.door_naam;
  switch (r.door_rol) {
    case 'authenticated': return 'Ingelogde gebruiker';
    case 'service_role': return 'Ribba-server';
    case 'postgres': return 'Database (SQL of cron)';
    case 'anon': return 'Niet ingelogd';
    default: return r.door_rol;
  }
}
