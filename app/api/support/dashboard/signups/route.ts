import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {parseSignupWeeks,parseWeeksParam} from '@/lib/owner-signups';
export const dynamic='force-dynamic';
/** Inschrijvingendashboard: tellingen en schoolnamen (geen contactgegevens), na eigenaar-, MFA- en auditcontrole. */
export async function GET(req:NextRequest){
 const weeks=parseWeeksParam(new URL(req.url).searchParams.get('weeks'));
 return withSupportAccess(req,{action:'owner.signups.read',ownerOnly:true,level:0},async({supabase,user})=>{
  if(weeks===null)throw new SupportRequestError('Kies 4, 12 of 26 weken.',400);
  const {data,error}=await supabase.rpc('owner_signup_weeks',{p_actor:user.id,p_weeks:weeks});
  const parsed=error?null:parseSignupWeeks(data);
  if(!parsed)throw new SupportRequestError('Het weekoverzicht is nog niet beschikbaar. Probeer later opnieuw.',503);
  return parsed;
 });
}
