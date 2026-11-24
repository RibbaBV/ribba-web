import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 return withSupportAccess(req,{action:'owner.school_accounts.summary',ownerOnly:true,level:0,targetType:'school_accounts'},async({supabase,user})=>{
  const {data,error}=await supabase.rpc('owner_support_school_accounts',{p_actor:user.id});
  if(error||!data)throw new SupportRequestError('De schooltotalen zijn nog niet beschikbaar.',503);
  return data;
 });
}
export async function POST(req:NextRequest){
 const body=await req.json().catch(()=>null);
 const valid=body&&typeof body.school==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.school)
  &&['all','linked','unlinked','active_today','online'].includes(body.link)&&['all','active','waitlist','graduated','inactive','suspended'].includes(body.status)
  &&Number.isInteger(body.page)&&body.page>=0&&body.page<=10000;
 return withSupportAccess(req,{action:'owner.school_accounts.cards',ownerOnly:true,level:2,targetType:'school_cards',reason:'Eigenaar bekijkt administratieve leerlingkaarten',meta:valid?{school:body.school,link:body.link,status:body.status,page:body.page}:undefined},async({supabase,user})=>{
  if(!valid)throw new SupportRequestError('Kies een geldige school en filters.',400);
  const {data,error}=await supabase.rpc('owner_support_school_cards',{p_actor:user.id,p_school:body.school,p_link:body.link,p_status:body.status,p_page:body.page});
  if(error||!data)throw new SupportRequestError('De leerlingkaarten konden niet worden geladen.',503);
  return data;
 });
}
