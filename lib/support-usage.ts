/** Contract shared with ribbaPro 20261124120000; no historical inference from login. */
export type UsageKind = 'learner'|'school'|'parent';
export type UsageCohort = 'with_school'|'without_school'|'unknown';
export type Presence = 'online'|'offline'|'unknown';
export interface UserSelection {
 kind: UsageKind|'all'; cohort: UsageCohort|'all'; presence: Presence|'all';
 metric: 'current'|'new'|'active'; day: string; school_id: string; query: string;
}
export const defaultSelection: UserSelection = {kind:'learner',cohort:'all',presence:'all',metric:'current',day:'',school_id:'',query:''};
export const kindLabels = {learner:'Leerlingen',school:'Rijschoolgebruikers',parent:'Ouders'};
export const cohortLabels = {with_school:'Met actieve rijschool',without_school:'Zonder actieve rijschool',unknown:'Schoolindeling onbekend'};
export const presenceLabels = {online:'Online',offline:'Niet online gemeten',unknown:'Onbekend'};
export interface UsageDay {
 day:string;measured:boolean;new_with_school:number;new_without_school:number;new_unknown:number;new_school_users:number;
 active_with_school:number;active_without_school:number;active_school_users:number;active_parents:number;
}
export interface UsageSummary {
 captured_at:string;measured_since:string;
 totals:{learners:number;with_school:number;without_school:number;no_link:number;waitlist:number;other_school_states:number;online:number;unknown:number;school_users:number};
 online_by_kind:{kind:UsageKind;cohort:UsageCohort;users:number}[];
 days:UsageDay[];
 schools:{id:string;name:string;learners:number;online_learners:number;online_school_users:number}[];
 versions:{kind:UsageKind;app_version:string|null;platform:string|null;ota_id:string|null;users:number}[];
}
export interface UsageUser {
 user_id:string;name:string|null;email:string|null;kind:UsageKind;school_state:string;
 schools:{id:string;name:string;status:string}[];registered_at:string;presence:Presence;last_seen_at:string|null;
 app_version:string|null;platform:string|null;ota_id:string|null;selection_cohort:UsageCohort;
 sessions:{session_id:string;seen_at:string;app_version:string;platform:string;ota_id:string;online:boolean}[];
}
export interface UsageUsers {captured_at:string;total:number;page:number;page_size:number;rows:UsageUser[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseUsageDays(value:string|null):7|30|90|null {
 return value===null||value==='30'?30:value==='7'?7:value==='90'?90:null;
}
function isDay(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function parseUserSelection(value:unknown):{filter:UserSelection;page:number}|null {
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>,f=v.filter as Record<string,unknown>|null;
 if(!f||typeof f!=='object'||Array.isArray(f)||!Number.isInteger(v.page)||Number(v.page)<0||Number(v.page)>10000)return null;
 if(!['all','learner','school','parent'].includes(String(f.kind))||!['all','with_school','without_school','unknown'].includes(String(f.cohort))
 ||!['all','online','offline','unknown'].includes(String(f.presence))||!['current','new','active'].includes(String(f.metric))
 ||typeof f.query!=='string'||f.query.length>100||typeof f.school_id!=='string'||(f.school_id!==''&&!uuid.test(f.school_id))
 ||typeof f.day!=='string'||(f.day!==''&&!isDay(f.day))||(f.metric!=='current'&&!isDay(f.day)))return null;
 return {filter:{kind:f.kind as UserSelection['kind'],cohort:f.cohort as UserSelection['cohort'],presence:f.presence as UserSelection['presence'],
 metric:f.metric as UserSelection['metric'],query:f.query.trim(),school_id:f.school_id,day:f.day},page:Number(v.page)};
}
/** User timestamps always use the same Amsterdam clock as the database day buckets. */
export function usageDate(value:string|null):string {
 return value?new Date(value).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'}):'Onbekend';
}
export function usageIsStale(capturedAt:string,now:number):boolean {
 const captured=Date.parse(capturedAt);return !Number.isFinite(captured)||now-captured>60_000;
}
