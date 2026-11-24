/** Read-only aggregate queries. No arbitrary SQL or person identifiers from the client. */
export const supportEvents = {
 theory_topic_completed:'Theorieonderwerp afgerond', study_flashcard_reviewed:'Flashcard geoefend', driving_video_first_playback_started:'Rijvideo gestart', user_logged_in:'Inloggen', lesson_requested:'Les aangevraagd', lesson_request_decided:'Lesaanvraag behandeld',
 lesson_created:'Les gepland', practice_exam_started:'Oefenexamen gestart',
 practice_exam_submitted:'Oefenexamen ingeleverd', study_flashcards_opened:'Flashcards geopend',
 app_repeated_tap:'Herhaald tikken', $exception:'Appfouten',
} as const;
export function supportPosthogQuery(days:7|30|90):string {
 const events=Object.keys(supportEvents).map(event=>`'${event}'`).join(',');
 return `SELECT event, count() AS occurrences, uniq(distinct_id) AS identities FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY AND timestamp <= now() AND event IN (${events}) GROUP BY event ORDER BY occurrences DESC LIMIT 20`;
}
export async function readSupportPosthog(days:7|30|90) {
 const key=process.env.POSTHOG_PERSONAL_API_KEY;
 const project=process.env.POSTHOG_PROJECT_ID;
 if(!key||!project)return {status:'not_configured' as const,rows:[]};
 if(!/^\d+$/.test(project))throw new Error('Invalid PostHog project configuration');
 const response=await fetch(`https://eu.posthog.com/api/projects/${project}/query/`,{
  method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:{kind:'HogQLQuery',query:supportPosthogQuery(days)}}),
  signal:AbortSignal.timeout(15000),cache:'no-store',
 });
 if(!response.ok)throw new Error('PostHog query unavailable');
 const data=await response.json();
 if(!Array.isArray(data.results))throw new Error('Invalid PostHog response');
 const rows=data.results.map((row:unknown)=>{
  if(!Array.isArray(row)||row.length!==3||typeof row[0]!=='string'||!Object.hasOwn(supportEvents,row[0])
    ||!Number.isSafeInteger(row[1])||row[1]<0||!Number.isSafeInteger(row[2])||row[2]<0)throw new Error('Invalid PostHog row');
  return {event:row[0],label:supportEvents[row[0] as keyof typeof supportEvents],occurrences:row[1] as number,identities:row[2] as number};
 });
 return {status:'ready' as const,captured_at:new Date().toISOString(),days,rows};
}
