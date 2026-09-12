// Gratis proefles — gedeelde types, validatie en teksten voor de webkant.
//
// Het contract (RPC-namen, parameters en de uitkomsten die ze teruggeven) is
// gedefinieerd in ribbaPro: supabase/migrations/20260912140000_gratis_proefles.sql
// en docs/design/gratis-proefles-ontwerp-2026-09-12.md. Deze repo heeft geen
// eigen migraties; wijzigt daar een uitkomst, dan hoort deze file mee te gaan.

import { isValidEmail, isValidInternationalPhone } from '@/utils/validation';

// ── Uitkomsten zoals de RPC's ze teruggeven ────────────────────────────────

export type IndienUitkomst =
  | 'ingediend'
  | 'al_actief'
  | 'te_vaak'
  | 'ongeldig_tijdslot'
  | 'toestemming_ontbreekt'
  | 'ongeldige_gegevens'
  | 'niet_beschikbaar';

export type BevestigUitkomst = 'bevestigd' | 'al_bevestigd' | 'verlopen' | 'al_actief' | 'niet_gevonden';

export type LeerlingAnnuleerUitkomst = 'geannuleerd' | 'al_afgesloten' | 'voorbij' | 'niet_gevonden';

export type AanbodActie = 'accepteren' | 'afwijzen' | 'annuleren' | 'afmelden';
export const AANBOD_ACTIES: readonly AanbodActie[] = ['accepteren', 'afwijzen', 'annuleren', 'afmelden'];

export type AanbodUitkomst =
  | 'geaccepteerd'
  | 'al_geaccepteerd'
  | 'al_vergeven'
  | 'al_afgewezen'
  | 'afgewezen'
  | 'verlopen'
  | 'geannuleerd'
  | 'afgemeld'
  | 'niet_geaccepteerd'
  | 'voorbij'
  | 'niet_gevonden';

export type AanvraagStatus = 'onbevestigd' | 'zoekend' | 'geaccepteerd' | 'niet_gevonden' | 'geannuleerd' | 'verlopen';
export type AanbodStatus = 'open' | 'geaccepteerd' | 'afgewezen' | 'ingetrokken' | 'geannuleerd';

// ── Weergaven (jsonb uit de bekijk-RPC's) ──────────────────────────────────

export type BevestigingWeergave =
  | { gevonden: false }
  | { gevonden: true; status: AanvraagStatus; voornaam: string; start_at: string; ophaal_adres: string };

export type LeerlingWeergave =
  | { gevonden: false }
  | {
      gevonden: true;
      status: AanvraagStatus;
      geannuleerd_door: 'leerling' | 'rijschool' | null;
      voornaam: string;
      start_at: string;
      duur_minuten: number;
      ophaal_adres: string;
      ophaal_plaats: string | null;
      kan_annuleren: boolean;
      rijschool: { naam: string; telefoon: string | null; email: string | null; website: string | null; plaats: string | null } | null;
    };

export type AanbodWeergave =
  | { gevonden: false }
  | {
      gevonden: true;
      aanbod_id: string;
      status: AanbodStatus;
      aanvraag_status: AanvraagStatus;
      geannuleerd_door: 'leerling' | 'rijschool' | null;
      rijschool_naam: string | null;
      afgemeld: boolean;
      voornaam: string;
      ophaal_plaats: string | null;
      afstand_km: number;
      start_at: string;
      duur_minuten: number;
      aangeboden_at: string;
      kan_accepteren: boolean;
      kan_annuleren: boolean;
      leerling: { naam: string; email: string; telefoon: string; ophaal_adres: string; ophaal_lat: number; ophaal_lon: number } | null;
    };

// ── Validatie ──────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProeflesToken(token: unknown): token is string {
  return typeof token === 'string' && UUID_RE.test(token);
}

/** Zelfde grove begrenzing als de CHECK op proefles_aanvragen. */
export function binnenNederland(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= 50.7 && lat <= 53.7 && lon >= 3.2 && lon <= 7.3;
}

export type AanvraagInvoer = {
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  plaats: string | null;
  lat: number;
  lon: number;
  start_at: string;
};

export type VeldFout = { veld: keyof AanvraagInvoer | 'toestemming'; melding: string };

/** Vormcontrole van de aanvraag. Geeft de genormaliseerde invoer of de eerste fout. */
export function valideerAanvraag(body: Record<string, unknown>): { ok: true; invoer: AanvraagInvoer } | { ok: false; fout: VeldFout } {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const naam = str(body.naam);
  const email = str(body.email).toLowerCase();
  const telefoon = str(body.telefoon);
  const adres = str(body.adres);
  const plaats = str(body.plaats) || null;

  if (naam.length < 2 || naam.length > 120) return { ok: false, fout: { veld: 'naam', melding: 'Vul je naam in.' } };
  if (email.length > 254 || !isValidEmail(email)) return { ok: false, fout: { veld: 'email', melding: 'Vul een geldig e-mailadres in.' } };
  if (telefoon.length > 30 || !isValidInternationalPhone(telefoon)) return { ok: false, fout: { veld: 'telefoon', melding: 'Vul een geldig telefoonnummer in.' } };
  if (adres.length < 3 || adres.length > 300) return { ok: false, fout: { veld: 'adres', melding: 'Kies een ophaaladres.' } };
  if (plaats && plaats.length > 120) return { ok: false, fout: { veld: 'plaats', melding: 'Ongeldige plaats.' } };
  if (!binnenNederland(body.lat, body.lon)) return { ok: false, fout: { veld: 'lat', melding: 'Kies een ophaallocatie in Nederland.' } };
  if (typeof body.start_at !== 'string' || Number.isNaN(Date.parse(body.start_at))) {
    return { ok: false, fout: { veld: 'start_at', melding: 'Kies een dag en tijd.' } };
  }
  if (body.akkoord_voorwaarden !== true || body.akkoord_privacy !== true || body.akkoord_delen !== true) {
    return { ok: false, fout: { veld: 'toestemming', melding: 'Ga akkoord met de voorwaarden, het privacybeleid en het delen van je gegevens.' } };
  }
  return {
    ok: true,
    invoer: { naam, email, telefoon, adres, plaats, lat: body.lat as number, lon: body.lon as number, start_at: body.start_at },
  };
}

const BRON_SLEUTELS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'tip', 'referrer', 'landing_page', 'bron_pagina',
] as const;

/** Whitelist voor p_bron: alleen bekende sleutels, alleen korte strings. */
export function sanitizeBron(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const uit: Record<string, string> = {};
  for (const k of BRON_SLEUTELS) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) uit[k] = v.trim().slice(0, 300);
  }
  return uit;
}

// ── Teksten ────────────────────────────────────────────────────────────────

export const INDIEN_MELDING: Record<Exclude<IndienUitkomst, 'ingediend'>, string> = {
  al_actief: 'Je hebt al een proefles-aanvraag die loopt. Kijk in je mail voor de status, of annuleer die eerst.',
  te_vaak: 'Je hebt vandaag al vaak een aanvraag gedaan. Probeer het morgen opnieuw.',
  ongeldig_tijdslot: 'Dit tijdstip is niet (meer) beschikbaar. Kies een ander moment.',
  toestemming_ontbreekt: 'Ga akkoord met de voorwaarden, het privacybeleid en het delen van je gegevens.',
  ongeldige_gegevens: 'Er klopt iets niet aan je gegevens. Controleer ze en probeer het opnieuw.',
  niet_beschikbaar: 'Gratis proeflessen aanvragen kan op dit moment niet. Probeer het later opnieuw.',
};

export const AANBOD_MELDING: Record<AanbodUitkomst, string> = {
  geaccepteerd: 'Gelukt! De proefles is van jou. De leerling krijgt jouw gegevens en jij hebt een bevestiging per mail.',
  al_geaccepteerd: 'Je had deze proefles al geaccepteerd.',
  al_vergeven: 'Helaas, een andere rijschool was je net voor.',
  al_afgewezen: 'Je had deze proefles al afgeslagen.',
  afgewezen: 'Oké, we vragen een andere rijschool. Bedankt voor je reactie.',
  verlopen: 'Deze proefles is niet meer beschikbaar.',
  geannuleerd: 'Deze proefles is geannuleerd.',
  afgemeld: 'Je bent afgemeld. Je krijgt geen proefles-aanvragen meer van Ribba.',
  niet_geaccepteerd: 'Deze proefles staat niet (meer) op jouw naam.',
  voorbij: 'Deze proefles is al voorbij.',
  niet_gevonden: 'Deze link is ongeldig.',
};

export const LEERLING_ANNULEER_MELDING: Record<LeerlingAnnuleerUitkomst, string> = {
  geannuleerd: 'Je proefles is geannuleerd.',
  al_afgesloten: 'Deze aanvraag was al afgesloten.',
  voorbij: 'Deze proefles is al voorbij.',
  niet_gevonden: 'Deze link is ongeldig.',
};
