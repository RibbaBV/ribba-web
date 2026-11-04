import {NextRequest} from 'next/server';
import {getServiceClient} from '@/lib/support-auth';
import {supportJson} from '@/lib/support-response';
import {sendLearnerDigest,type LearnerDigest} from '@/lib/owner-learner-digest';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return supportJson({error:'Geen toegang.'},401);
 // Activation is separate from deployment. Never send from previews.
 if(process.env.VERCEL_ENV!=='production'||process.env.OWNER_LEARNER_DIGEST_ENABLED!=='true')return supportJson({status:'disabled'});
 if(!process.env.RESEND_API_KEY)return supportJson({error:'Mail niet ingesteld.'},503);
 try{
  const db=getServiceClient();
  const {data,error}=await db.rpc('claim_owner_learner_digest');
  if(error)throw new Error('Claim failed');
  if(!data)return supportJson({status:'skipped'});
  await sendLearnerDigest(data as LearnerDigest,process.env.RESEND_API_KEY);
  const finished=await db.rpc('finish_owner_learner_digest',{p_day:data.day,p_lease:data.lease_id});
  if(finished.error||finished.data!==true)throw new Error('Finish failed');
  return supportJson({status:'sent'});
 }catch{
  // No recipient, credentials or provider body in logs/responses.
  console.error('[owner-learners] dagelijkse samenvatting niet afgerond');
  return supportJson({error:'Samenvatting niet afgerond; controleer de meettaak.'},503);
 }
}
