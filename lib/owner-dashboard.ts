import type {JourneyData} from './owner-journey';
export type AttentionReason = 'no_lesson_type' | 'no_first_lesson' | 'inactive';
export interface GrowthMetrics { schools: number; new: number; previous_new: number; active: number; previous_active: number; lessons: number; previous_lessons: number }
export interface GrowthInsight { evidence: AttentionReason | 'activation' | 'usage' | 'support'; title: string; hypothesis: string; action: string; measure: string }
export interface GrowthDashboard {
 journey?:JourneyData;
 status: 'ready'; captured_at: string; days: 7 | 30; definition_version: number; history_since: string;
 metrics: GrowthMetrics;
 trend: {day:string;schools:number}[];
 onboarding: {total:number;profile:number;lesson_type:number;first_lesson:number};
 attention: {school_id:string;name:string;reason:AttentionReason;age_days:number}[];
 latest_ai: {created_at:string;snapshot_at:string;result:{suggestions:GrowthInsight[];evidence?:{days:number;metrics:GrowthMetrics;journey?:{support_window_days:number;topics:{topic:string;cases:number;schools:number;open:number}[]}|null}}} | null;
}
export const attentionLabels: Record<AttentionReason,string> = {
 no_lesson_type:'Minstens 3 dagen aangemeld, nog geen ingeschakeld lestype',
 no_first_lesson:'Minstens 7 dagen aangemeld, nog geen les buiten de Plango-import',
 inactive:'Minstens 14 dagen geen nieuwe les of factuur geregistreerd',
};
export function periodFromUrl(url: string): 7 | 30 | null {
 const value=new URL(url).searchParams.get('days');
 return value===null || value==='30' ? 30 : value==='7' ? 7 : null;
}
/** Explicit allowlist: never pass school names, IDs, emails or free text to AI. */
export function growthEvidence(data: GrowthDashboard) {
 const count=(reason:AttentionReason)=>data.attention.filter(a=>a.reason===reason).length;
 return {
  days:data.days, definition_version:data.definition_version,
  metrics: {schools:data.metrics.schools,new:data.metrics.new,previous_new:data.metrics.previous_new,
   active:data.metrics.active,previous_active:data.metrics.previous_active,lessons:data.metrics.lessons,previous_lessons:data.metrics.previous_lessons},
  onboarding:{total:data.onboarding.total,profile:data.onboarding.profile,lesson_type:data.onboarding.lesson_type,first_lesson:data.onboarding.first_lesson},
  measurement_limits:['No attempt or abandonment funnel','Customer account does not prove unassisted human usage','Package row does not prove a completed package workflow'],
  journey:data.journey?{captured_at:data.journey.captured_at,started_at:data.journey.quality.started_at,enabled:data.journey.quality.enabled,failures_30d:data.journey.quality.failures_30d,triggers_active:data.journey.quality.triggers_active,
   support_window_days:30,topics:data.journey.support_topics.map(t=>({topic:t.topic,cases:t.cases,schools:t.schools,open:t.open}))}:null,
  signals:{no_lesson_type:count('no_lesson_type'),no_first_lesson:count('no_first_lesson'),inactive:count('inactive')},
 };
}
export function validateInsights(value:unknown): {suggestions:GrowthInsight[]} {
 if (!value || typeof value!=='object' || !('suggestions' in value) || !Array.isArray(value.suggestions) || value.suggestions.length>3) throw new Error('Invalid insights');
 const evidence=['no_lesson_type','no_first_lesson','inactive','activation','usage','support'];
 for(const item of value.suggestions) {
  if (!item || typeof item!=='object' || !evidence.includes(item.evidence)) throw new Error('Invalid evidence');
  for(const key of ['title','hypothesis','action','measure']) {
   if(typeof item[key]!=='string' || !item[key].trim() || item[key].length>(key==='title'?100:600)) throw new Error('Invalid insight text');
  }
 }
 return {suggestions:value.suggestions.map(i=>({evidence:i.evidence,title:i.title,hypothesis:i.hypothesis,action:i.action,measure:i.measure}))};
}
