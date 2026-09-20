// Tijdsloten voor de gratis proefles: morgen t/m over 7 dagen, op het hele
// uur van 08:00 t/m 21:00, en nooit binnen 12 uur vanaf nu.
//
// WAAROM ALLES IN EUROPE/AMSTERDAM. "Morgen 10:00" betekent voor de leerling
// Nederlandse tijd, ook als de browser in een andere tijdzone staat (vakantie,
// een verkeerd ingestelde laptop). De database rekent ook in Amsterdam; wie
// hier in lokale browsertijd rekent, krijgt `ongeldig_tijdslot` terug zonder
// te snappen waarom.
//
// De grenzen zijn een kopie van de standaardwaarden in
// public.proefles_instellingen (ribbaPro, migratie 20260912140000). De
// database blijft de bewaker; dit is alleen wat de kalender aanbiedt.

export const EERSTE_UUR = 8;
export const LAATSTE_UUR = 21;
export const MAX_DAGEN_VOORUIT = 7;
export const MIN_VOORLOOPTIJD_MS = 12 * 60 * 60 * 1000;

const TZ = 'Europe/Amsterdam';

type Delen = { jaar: number; maand: number; dag: number; uur: number; minuut: number };

function amsterdamDelen(d: Date): Delen {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { jaar: +p.year, maand: +p.month, dag: +p.day, uur: +p.hour, minuut: +p.minute };
}

/** Het UTC-moment van een lokale Amsterdamse kloktijd. */
export function amsterdamNaarUtc(jaar: number, maand: number, dag: number, uur: number): Date {
  // Begin bij "doe alsof het UTC is" en corrigeer twee keer met de werkelijke
  // afwijking; de tweede ronde vangt de dagen rond de zomertijdwissel.
  let gok = Date.UTC(jaar, maand - 1, dag, uur);
  for (let i = 0; i < 2; i++) {
    const d = amsterdamDelen(new Date(gok));
    const alsUtc = Date.UTC(d.jaar, d.maand - 1, d.dag, d.uur, d.minuut);
    gok += Date.UTC(jaar, maand - 1, dag, uur) - alsUtc;
  }
  return new Date(gok);
}

export type ProeflesSlot = {
  uur: number;
  label: string;        // "10:00"
  iso: string;          // UTC-ISO van het begin
  beschikbaar: boolean; // false binnen de minimale voorlooptijd
};

export type ProeflesDag = {
  datum: string;        // "2026-09-15" (Amsterdam)
  weekdag: string;      // "di"
  dagLabel: string;     // "15 sep"
  langLabel: string;    // "dinsdag 15 september"
  slots: ProeflesSlot[];
  heeftBeschikbaar: boolean;
};

function tweeCijfers(n: number): string {
  return String(n).padStart(2, '0');
}

export function proeflesDagen(nu: Date = new Date()): ProeflesDag[] {
  const vandaag = amsterdamDelen(nu);
  const dagen: ProeflesDag[] = [];

  for (let plus = 1; plus <= MAX_DAGEN_VOORUIT; plus++) {
    // Kalenderrekenen op een UTC-middag: geen tijdzone- of zomertijdrand.
    const kalender = new Date(Date.UTC(vandaag.jaar, vandaag.maand - 1, vandaag.dag + plus, 12));
    const jaar = kalender.getUTCFullYear();
    const maand = kalender.getUTCMonth() + 1;
    const dag = kalender.getUTCDate();
    const middag = amsterdamNaarUtc(jaar, maand, dag, 12);

    const slots: ProeflesSlot[] = [];
    for (let uur = EERSTE_UUR; uur <= LAATSTE_UUR; uur++) {
      const start = amsterdamNaarUtc(jaar, maand, dag, uur);
      slots.push({
        uur,
        label: `${tweeCijfers(uur)}:00`,
        iso: start.toISOString(),
        beschikbaar: start.getTime() >= nu.getTime() + MIN_VOORLOOPTIJD_MS,
      });
    }

    dagen.push({
      datum: `${jaar}-${tweeCijfers(maand)}-${tweeCijfers(dag)}`,
      weekdag: new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: TZ }).format(middag).replace('.', ''),
      dagLabel: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: TZ }).format(middag).replace('.', ''),
      langLabel: new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(middag),
      slots,
      heeftBeschikbaar: slots.some((s) => s.beschikbaar),
    });
  }
  return dagen;
}

/**
 * Server-side voorcontrole met dezelfde regels als de kalender. De database
 * controleert opnieuw; dit geeft alleen een nette foutmelding zonder RPC.
 */
export function isGeldigProeflesSlot(iso: unknown, nu: Date = new Date()): boolean {
  if (typeof iso !== 'string') return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return proeflesDagen(nu).some((d) => d.slots.some((s) => s.beschikbaar && Date.parse(s.iso) === t));
}

/** "dinsdag 15 september, 10:00 – 11:00" in Amsterdamse tijd. */
export function formatProeflesMoment(iso: string, duurMinuten = 60): string {
  const start = new Date(iso);
  const eind = new Date(start.getTime() + duurMinuten * 60_000);
  const dag = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(start);
  const tijd = (d: Date) => new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
  return `${dag}, ${tijd(start)} – ${tijd(eind)}`;
}
