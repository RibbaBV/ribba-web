export const topics = {profile:'Rijschoolgegevens',students:'Leerlingen',packages:'Pakketten',planning:'Planning',invitations:'Uitnodigingen',billing:'Facturatie',other:'Overig'} as const;
export const blockers = {how_to:'Hoe werkt dit?',error:'Foutmelding',missing_feature:'Functie ontbreekt',configuration:'Instelling ontbreekt',other:'Anders'} as const;
export const assistance = {explanation:'Uitleg gegeven',together:'Samen ingevuld',done_for_customer:'Voor de klant uitgevoerd'} as const;
export const resolutions = {pending:'Nog niet opgelost',explained:'Opgelost met uitleg',configured:'Instellingen aangepast',workaround:'Tijdelijke oplossing',product_fix:'Product aangepast'} as const;
export const eventLabels:Record<string,string> = {school_registered:'Rijschoolrecord aangemaakt',profile_ready:'Naam, e-mail en plaats ingevuld',student_created:'Leerlingrecord aangemaakt',lesson_type_enabled:'Lestype voor het eerst ingeschakeld sinds meetstart',package_created:'Pakketrecord aangemaakt',lesson_created:'Lesrecord aangemaakt',invitation_accepted:'Uitnodiging als gebruikt gemarkeerd',profile_supported:'Rijschoolgegevens via support aangepast'};
export const sourceLabels:Record<string,string> = {customer:'Klantaccount',support:'Support',import:'Import',system:'Achtergrondproces',unknown:'Herkomst onbekend'};
export interface CaseInput {version:1;topic:keyof typeof topics;blocker:keyof typeof blockers;assistance:keyof typeof assistance;resolution:keyof typeof resolutions;status:'open'|'resolved';minutes:number;follow_up:string|null}
export interface SupportCase extends CaseInput {id:string;school_id:string;school_name:string;revision:number;created_at:string;updated_at:string}
export interface JourneyData {
 status:'ready';captured_at:string;definition_version:number;
 quality:{enabled:boolean;started_at:string;maintained_at:string|null;failures_30d:number;triggers_active:number};
 schools:{id:string;name:string}[];
 summary:{events:number;customer:number;support:number;import:number;unknown:number};
 support_summary:{open:number;due:number;minutes_30d:number};
 events:{id:string;event_name:string;source:string;occurred_at:string;received_at:string}[];
 support_topics:{topic:keyof typeof topics;cases:number;schools:number;open:number}[];
 cases:SupportCase[];
}
export const isUuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function parseCaseRequest(value:unknown):{school_id:string;id:string;revision:number;case:CaseInput}|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==4||!isUuid(v.school_id)||!isUuid(v.id)||!Number.isInteger(v.revision)||Number(v.revision)<0)return null;
 if(!v.case||typeof v.case!=='object'||Array.isArray(v.case))return null;
 const c=v.case as Record<string,unknown>;
 if(['topic','blocker','assistance','resolution','status'].some(k=>typeof c[k]!=='string'))return null;
 if(Object.keys(c).length!==8||c.version!==1||!Object.hasOwn(topics,String(c.topic))||!Object.hasOwn(blockers,String(c.blocker))||!Object.hasOwn(assistance,String(c.assistance))||!Object.hasOwn(resolutions,String(c.resolution)))return null;
 if(c.status!=='open'&&c.status!=='resolved'||(c.status==='open')!==(c.resolution==='pending'))return null;
 if(!Number.isInteger(c.minutes)||Number(c.minutes)<0||Number(c.minutes)>480)return null;
 if(c.follow_up!==null){
  if(typeof c.follow_up!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(c.follow_up))return null;
  const date=new Date(c.follow_up+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==c.follow_up||date.getTime()>Date.now()+366*86400000)return null;
 }
 return {school_id:v.school_id,id:v.id,revision:Number(v.revision),case:c as unknown as CaseInput};
}
