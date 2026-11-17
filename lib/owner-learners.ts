export const learnerFilters = ['without_active','all','none','waitlist','active','graduated','inactive','never_signed_in'] as const;
export type LearnerFilter = typeof learnerFilters[number];
export const learnerFilterLabels: Record<LearnerFilter,string> = {
 without_active:'Zonder actieve rijschool',all:'Alle leerlingaccounts',none:'Geen schoolkoppeling',waitlist:'Wachtlijst',active:'Actieve rijschool',graduated:'Geslaagd',inactive:'Gestopt / geschorst',never_signed_in:'Nog niet ingelogd',
};
export interface LearnerSummary {
 captured_at:string; definition_version:number;
 metrics:{accounts:number;without_active_school:number;no_school:number;waitlist:number;graduated:number;inactive:number;registration_hint:number;hint_with_active_school:number;/** Sinds definition_version 2 (ribbaPro 20261111090000). */hint_no_school?:number;hint_new_30?:number;never_signed_in:number;incomplete_without_school:number;new_7:number;new_30:number;previous_new_30:number;signed_in_30:number};
 trend:{day:string;accounts:number}[];
}
export interface LearnerList {
 total:number;page:number;page_size:number;
 rows:{user_id:string;email:string|null;name:string|null;name_source:'learner_profile'|'school_record'|null;registered_at:string;last_sign_in_at:string|null;registration_hint:boolean;profile_complete:boolean;school_state:'none'|'waitlist'|'active'|'graduated'|'inactive';schools:{id:string;name:string;status:string}[]}[];
}
/** Validate bounded owner searches and require an auditable reason before returning normalized input. */
export function parseLearnerQuery(value:unknown): {filter:LearnerFilter;query:string;page:number;reason:string}|null {
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.filter!=='string'||!learnerFilters.includes(v.filter as LearnerFilter)||typeof v.query!=='string'||v.query.length>100
 ||typeof v.page!=='number'||!Number.isInteger(v.page)||v.page<0||v.page>10000||typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.length>300)return null;
 return {filter:v.filter as LearnerFilter,query:v.query.trim(),page:v.page,reason:v.reason.trim()};
}
/** Zelf aangemeld (11 nov 2026): accounts met de markering van de zelfstandige registratie, zonder uitnodiging van een rijschool. De twee nieuwe metingen bestaan pas na ribbaPro 20261111090000; tot dan alleen het bekende deel. */
export function zelfAangemeldUitleg(m:LearnerSummary['metrics']):string{
 const delen=[typeof m.hint_new_30==='number'?`${m.hint_new_30} in de laatste 30 dagen`:null,typeof m.hint_no_school==='number'?`${m.hint_no_school} nog zonder rijschool`:null,`${m.hint_with_active_school} nu bij een rijschool`];
 return delen.filter(Boolean).join(' · ');
}


// ── Leerlingkaart (17 nov 2026) ────────────────────────────────────────────
// Eén leerling, achter dezelfde poort als de lijst. Bron: owner_learner_detail
// (ribbaPro 20261117150000). Geen nieuwe meting; alleen een nieuw venster.
export interface LearnerDetail {
 captured_at:string;definition_version:number;
 account:LearnerList['rows'][number];
 activity:{measured_since:string;last_event_at:string|null;active_days_7:number;active_days_30:number;events_30:number;
  days:{day:string;events:number;screens:number}[];
  per_day:{day:string;items:{soort:'scherm'|'klik';scherm:string|null;element:string|null;keer:number}[]}[];
  top_screens:{scherm:string|null;keer:number}[]};
 theory:{topics_visited:number;topics_completed:number;last_visit:string|null};
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Valideer het id uit de URL en de inzagereden uit het formulier; alles anders wordt geweigerd. */
export function parseLearnerDetailQuery(id:unknown,value:unknown):{userId:string;reason:string}|null{
 if(typeof id!=='string'||!UUID.test(id))return null;
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.length>300)return null;
 return {userId:id.toLowerCase(),reason:v.reason.trim()};
}
/** Korte, eerlijke samenvatting van de activiteit voor bovenaan de kaart. */
export function activiteitSamenvatting(a:LearnerDetail['activity']):string{
 if(!a.last_event_at)return 'Geen gemeten appgebruik sinds de meting begon ('+a.measured_since+').';
 return `${a.active_days_7} van de laatste 7 dagen actief · ${a.active_days_30} van de laatste 30 · ${a.events_30} handelingen in 30 dagen`;
}
