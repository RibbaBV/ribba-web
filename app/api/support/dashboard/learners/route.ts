import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {parseLearnerQuery} from '@/lib/owner-learners';
export const dynamic='force-dynamic';
/** Return learner totals only after owner, MFA and audit checks. */
export async function GET(req:NextRequest){
 return withSupportAccess(req,{action:'owner.learners.summary',ownerOnly:true,level:0},async({supabase,user})=>{
  const {data,error}=await supabase.rpc('owner_learner_summary',{p_actor:user.id});
  if(error||!data)throw new SupportRequestError('Leerlingmetingen zijn nog niet beschikbaar. Probeer later opnieuw.',503);
  return data;
 });
}
/** Return a bounded learner list after owner authorization and reason auditing; keep searches out of URLs. */
export async function POST(req:NextRequest){
 // Query is in POST body so email searches do not enter URLs/access logs.
 const input=parseLearnerQuery(await req.json().catch(()=>null));
 return withSupportAccess(req,{action:'owner.learners.list',ownerOnly:true,level:2,reason:input?.reason,targetType:'learner_accounts',meta:input?{filter:input.filter,page:input.page}:undefined},async({supabase,user})=>{
  if(!input)throw new SupportRequestError('Vul een geldige zoekopdracht en inzagereden in.',400);
  const {data,error}=await supabase.rpc('owner_learner_list',{p_actor:user.id,p_filter:input.filter,p_query:input.query,p_page:input.page});
  if(error||!data)throw new SupportRequestError('De leerlingenlijst kan niet worden geladen. Probeer later opnieuw.',503);
  return data;
 });
}
