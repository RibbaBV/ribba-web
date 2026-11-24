import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {parseUsageDays,parseUserSelection} from '@/lib/support-usage';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const days=parseUsageDays(new URL(req.url).searchParams.get('days'));
 return withSupportAccess(req,{action:'owner.usage.summary',ownerOnly:true,level:0,targetType:'usage_summary',meta:{days}},async({supabase,user})=>{
  if(days===null)throw new SupportRequestError('Kies 7, 30 of 90 dagen.',400);
  const {data,error}=await supabase.rpc('owner_support_usage',{p_actor:user.id,p_days:days});
  if(error||!data)throw new SupportRequestError('Het gebruikersoverzicht is nog niet beschikbaar. Probeer later opnieuw.',503);
  return data;
 });
}
export async function POST(req:NextRequest){
 const input=parseUserSelection(await req.json().catch(()=>null));
 return withSupportAccess(req,{action:'owner.usage.people',ownerOnly:true,level:2,
 reason:'Eigenaar bekijkt gebruikers in het gebruiksoverzicht',targetType:'usage_users',
 // No names, email queries or returned rows in the audit metadata.
 meta:input?{kind:input.filter.kind,cohort:input.filter.cohort,presence:input.filter.presence,metric:input.filter.metric,day:input.filter.day,school_id:input.filter.school_id,page:input.page}:undefined},async({supabase,user})=>{
  if(!input)throw new SupportRequestError('Vul geldige filters en een geldige dag in.',400);
  const {data,error}=await supabase.rpc('owner_support_users',{p_actor:user.id,p_filter:input.filter,p_page:input.page});
  if(error||!data)throw new SupportRequestError('De gebruikerslijst kan niet worden geladen. Probeer opnieuw.',503);
  return data;
 });
}
