export const learnerFilters = ['without_active','all','none','waitlist','active','graduated','inactive','never_signed_in'] as const;
export type LearnerFilter = typeof learnerFilters[number];
export const learnerFilterLabels: Record<LearnerFilter,string> = {
 without_active:'Zonder actieve rijschool',all:'Alle leerlingaccounts',none:'Geen schoolkoppeling',waitlist:'Wachtlijst',active:'Actieve rijschool',graduated:'Geslaagd',inactive:'Gestopt / geschorst',never_signed_in:'Nog niet ingelogd',
};
export interface LearnerSummary {
 captured_at:string; definition_version:number;
 metrics:{accounts:number;without_active_school:number;no_school:number;waitlist:number;graduated:number;inactive:number;registration_hint:number;hint_with_active_school:number;never_signed_in:number;incomplete_without_school:number;new_7:number;new_30:number;previous_new_30:number;signed_in_30:number};
 trend:{day:string;accounts:number}[];
}
export interface LearnerList {
 total:number;page:number;page_size:number;
 rows:{user_id:string;email:string|null;name:string|null;name_source:'learner_profile'|'school_record'|null;registered_at:string;last_sign_in_at:string|null;registration_hint:boolean;profile_complete:boolean;school_state:'none'|'waitlist'|'active'|'graduated'|'inactive';schools:{id:string;name:string;status:string}[]}[];
}
export function parseLearnerQuery(value:unknown): {filter:LearnerFilter;query:string;page:number;reason:string}|null {
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(typeof v.filter!=='string'||!learnerFilters.includes(v.filter as LearnerFilter)||typeof v.query!=='string'||v.query.length>100
 ||typeof v.page!=='number'||!Number.isInteger(v.page)||v.page<0||v.page>10000||typeof v.reason!=='string'||v.reason.trim().length<10||v.reason.length>300)return null;
 return {filter:v.filter as LearnerFilter,query:v.query.trim(),page:v.page,reason:v.reason.trim()};
}
