export interface LearnerDigest {day:string;recipient:string;lease_id:string;payload:{new_accounts:number;without_active_school:number;never_signed_in:number;incomplete_without_school:number}}
/** Keep v1 payload byte-stable across retries (Resend idempotency contract). */
export function learnerDigestMail(d:LearnerDigest){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.day)||!d.recipient||(['new_accounts','without_active_school','never_signed_in','incomplete_without_school'] as const).some(field=>{const n=d.payload?.[field];return !Number.isSafeInteger(n)||n<0;}))throw new Error('Invalid digest');
 return {from:'Ribba <noreply@ribba.nl>',to:[d.recipient],subject:`Ribba · leerlingenoverzicht ${d.day}`,
 text:[`Leerlingenoverzicht voor ${d.day}`,`Nieuwe accounts op deze dag: ${d.payload.new_accounts}`,`Zonder actieve rijschool (stand bij meting): ${d.payload.without_active_school}`,`Nog niet ingelogd: ${d.payload.never_signed_in}`,`Onvolledig zelfstandig profiel zonder actieve school: ${d.payload.incomplete_without_school}`,'',
 'Bekijk het beveiligde overzicht: https://mijn.ribba.app/support/dashboard/learners','',
 'Bekende testaccounts en interne schoolaccounts zijn uitgesloten. Onbekende testaccounts kunnen nog meetellen. Accountregistraties zijn geen downloads. Verwijderde accounts tellen niet mee.'].join('\n')};
}
/** Send a validated aggregate digest using the day as a stable retry key; reject provider errors or missing acknowledgements. */
export async function sendLearnerDigest(d:LearnerDigest,key:string){
 const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`owner-learners-v1/${d.day}`},body:JSON.stringify(learnerDigestMail(d)),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error('Digest provider failed');
 const body=await res.json();if(typeof body.id!=='string'||!body.id)throw new Error('Digest acknowledgement missing');
}
