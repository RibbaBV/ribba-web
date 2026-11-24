import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {parseUsageDays} from '@/lib/support-usage';
import {readSupportPosthog} from '@/lib/support-posthog';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const days=parseUsageDays(new URL(req.url).searchParams.get('days'));
 return withSupportAccess(req,{action:'owner.posthog.summary',ownerOnly:true,level:0,targetType:'posthog_summary',meta:{days}},async()=>{
  if(days===null)throw new SupportRequestError('Kies 7, 30 of 90 dagen.',400);
  try{return await readSupportPosthog(days);}
  catch{throw new SupportRequestError('PostHog is tijdelijk niet beschikbaar. Probeer later opnieuw.',503);}
 });
}
