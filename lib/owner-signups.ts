// Weekoverzicht van rijschool-inschrijvingen (19 nov 2026, werkitem A7).
// Bron: owner_signup_weeks (ribbaPro 20261119120000). Alleen tellingen, geen
// namen of e-mailadressen. Definities staan in die migratie.
export const signupWeekOptions = [4, 12, 26] as const;
export type SignupWeekOption = typeof signupWeekOptions[number];
export const signupFields = ['started','checkout','abandoned','open','activated','trialing','paying','stopped'] as const;
export type SignupField = typeof signupFields[number];
export type SignupCounts = Record<SignupField, number>;
export interface SignupWeeks {
 status:'ready';captured_at:string;definition_version:number;weeks_requested:number;from:string;
 abandon_after_days:number;excluded_tests:number;
 weeks:(SignupCounts&{week_start:string})[];
 totals:SignupCounts;
}
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
  || !isCount(v.excluded_tests) || !Array.isArray(v.weeks)) return null;
 const totals = counts(v.totals);
 if (!totals) return null;
 const weeks: SignupWeeks['weeks'] = [];
 for (const w of v.weeks) {
  const c = counts(w);
  const start = (w as Record<string, unknown>)?.week_start;
  if (!c || !isDate(start)) return null;
  weeks.push({ ...c, week_start: start as string });
 }
 return {
  status:'ready',captured_at:v.captured_at,definition_version:v.definition_version as number,
  weeks_requested:v.weeks_requested as number,from:v.from as string,
  abandon_after_days:v.abandon_after_days as number,excluded_tests:v.excluded_tests as number,weeks,totals,
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
