// Inschrijvingendashboard voor de eigenaar (19 nov 2026, werkitem A7).
// Bron: owner_signup_weeks versie 2 (ribbaPro 20261119160000): tellingen per
// week plus de lijst inschrijvingen met schoolnaam, plaats en fase. Geen
// e-mailadressen, telefoonnummers of bedragen. Definities staan in die migratie.
export const signupWeekOptions = [4, 12, 26] as const;
export type SignupWeekOption = typeof signupWeekOptions[number];
export const signupFields = ['started','checkout','abandoned','open','activated','trialing','paying','stopped'] as const;
export type SignupField = typeof signupFields[number];
export type SignupCounts = Record<SignupField, number>;
export const signupStages = ['paying','trialing','stopped','activated','checkout','abandoned','open'] as const;
export type SignupStage = typeof signupStages[number];
export interface Signup { created_at:string; name:string; city:string|null; stage:SignupStage }
export interface SignupWeeks {
 status:'ready';captured_at:string;definition_version:number;weeks_requested:number;from:string;
 abandon_after_days:number;excluded_tests:number;last_signup_at:string|null;
 weeks:(SignupCounts&{week_start:string})[];
 totals:SignupCounts;
 signups:Signup[];
}
export const stageLabels: Record<SignupStage,string> = {
 paying:'Betaalt',trialing:'In proef',stopped:'Gestopt',activated:'Account, nog geen abonnement',
 checkout:'Betaalgegevens ingevuld',abandoned:'Afgehaakt',open:'Nog bezig',
};
export const signupLabels: Record<SignupField,string> = {
 started:'Gestart',checkout:'Betaalgegevens',abandoned:'Afgehaakt',open:'Nog open',
 activated:'Actief',trialing:'In proef',paying:'Betalend',stopped:'Gestopt',
};

/** `?weeks=` mag leeg zijn (12) of exact 4, 12 of 26; al het andere is ongeldig. */
export function parseWeeksParam(value: string|null): SignupWeekOption|null {
 if (value === null || value === '') return 12;
 if (!/^\d{1,2}$/.test(value)) return null;
 const n = Number(value);
 return (signupWeekOptions as readonly number[]).includes(n) ? n as SignupWeekOption : null;
}

const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
function signup(v: unknown): Signup|null {
 if (!v || typeof v !== 'object') return null;
 const o = v as Record<string, unknown>;
 if (!isTime(o.created_at) || typeof o.name !== 'string' || !(o.city === null || typeof o.city === 'string')
  || !(signupStages as readonly unknown[]).includes(o.stage)) return null;
 return { created_at:o.created_at as string, name:o.name, city:(o.city as string|null)||null, stage:o.stage as SignupStage };
}
function counts(v: unknown): SignupCounts|null {
 if (!v || typeof v !== 'object') return null;
 const o = v as Record<string, unknown>;
 const out = {} as SignupCounts;
 for (const f of signupFields) { if (!isCount(o[f])) return null; out[f] = o[f] as number; }
 return out;
}

/** Controleer de RPC-payload; een afwijkende vorm wordt nooit half getoond. */
export function parseSignupWeeks(value: unknown): SignupWeeks|null {
 if (!value || typeof value !== 'object') return null;
 const v = value as Record<string, unknown>;
 if (v.status !== 'ready' || typeof v.captured_at !== 'string' || !isCount(v.definition_version)
  || !isCount(v.weeks_requested) || !isDate(v.from) || !isCount(v.abandon_after_days)
  || !isCount(v.excluded_tests) || !Array.isArray(v.weeks) || !Array.isArray(v.signups)
  || !(v.last_signup_at === null || isTime(v.last_signup_at))) return null;
 const totals = counts(v.totals);
 if (!totals) return null;
 const weeks: SignupWeeks['weeks'] = [];
 for (const w of v.weeks) {
  const c = counts(w);
  const start = (w as Record<string, unknown>)?.week_start;
  if (!c || !isDate(start)) return null;
  weeks.push({ ...c, week_start: start as string });
 }
 const signups: Signup[] = [];
 for (const x of v.signups) { const r = signup(x); if (!r) return null; signups.push(r); }
 return {
  status:'ready',captured_at:v.captured_at,definition_version:v.definition_version as number,
  weeks_requested:v.weeks_requested as number,from:v.from as string,
  abandon_after_days:v.abandon_after_days as number,excluded_tests:v.excluded_tests as number,
  last_signup_at:(v.last_signup_at as string|null),weeks,totals,signups,
 };
}

/** Percentage als hele procenten, of null als de noemer 0 is (dan valt er niets te zeggen). */
export function percentage(part: number, whole: number): number|null {
 if (!whole) return null;
 return Math.round(part / whole * 100);
}
export const checkoutRate = (c: SignupCounts) => percentage(c.checkout, c.started);
export const activationRate = (c: SignupCounts) => percentage(c.activated, c.started);
export const payingRate = (c: SignupCounts) => percentage(c.paying, c.activated);

const MAANDEN = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
/** "17 nov – 23 nov" voor een week die op maandag 17 november begint. */
export function weekLabel(weekStart: string): string {
 const [y, m, d] = weekStart.split('-').map(Number);
 const start = new Date(Date.UTC(y, m - 1, d));
 const end = new Date(Date.UTC(y, m - 1, d + 6));
 const fmt = (t: Date) => `${t.getUTCDate()} ${MAANDEN[t.getUTCMonth()]}`;
 return `${fmt(start)} – ${fmt(end)}`;
}

const NL = 'Europe/Amsterdam';
function nlParts(iso: string): {y:number;m:number;d:number} {
 const p = new Intl.DateTimeFormat('en-CA',{timeZone:NL,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
 const get = (t: string) => Number(p.find(x => x.type === t)?.value);
 return { y:get('year'), m:get('month'), d:get('day') };
}
/** "28 okt" in Nederlandse tijd. */
export function dayLabel(iso: string): string {
 const {m, d} = nlParts(iso);
 return `${d} ${MAANDEN[m - 1]}`;
}
/** Hele kalenderdagen (Nederlandse tijd) tussen `iso` en `now`. */
export function daysSince(iso: string, now: string): number {
 const a = nlParts(iso), b = nlParts(now);
 return Math.max(0, Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000));
}

/** Groepen voor de maandgrafiek: wat de eigenaar wil zien, niet elke fase apart. */
export type MonthGroup = 'paying'|'trialing'|'abandoned'|'other';
export const monthGroupOf = (s: SignupStage): MonthGroup =>
 s === 'paying' || s === 'trialing' || s === 'abandoned' ? s : 'other';
export interface SignupMonth { key:string; label:string; total:number; counts:Record<MonthGroup,number> }
/** Elke maand van `from` tot `now`, ook lege, met de inschrijvingen per groep. */
export function signupsByMonth(signups: Signup[], from: string, now: string): SignupMonth[] {
 const [fy, fm] = from.split('-').map(Number);
 const end = nlParts(now);
 const out: SignupMonth[] = [];
 for (let y = fy, m = fm; y < end.y || (y === end.y && m <= end.m); m === 12 ? (y++, m = 1) : m++) {
  out.push({ key:`${y}-${String(m).padStart(2,'0')}`, label:MAANDEN[m - 1], total:0,
   counts:{paying:0,trialing:0,abandoned:0,other:0} });
 }
 for (const s of signups) {
  const {y, m} = nlParts(s.created_at);
  const month = out.find(o => o.key === `${y}-${String(m).padStart(2,'0')}`);
  if (!month) continue;
  month.total++; month.counts[monthGroupOf(s.stage)]++;
 }
 return out;
}
