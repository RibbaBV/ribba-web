import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {parseLearnerDetailQuery,KAART_INZAGE_REDEN} from '@/lib/owner-learners';
export const dynamic='force-dynamic';
/** De leerlingkaart: één leerling, alleen voor de eigenaar; de vaste reden gaat naar het logboek (wie, wanneer, welke leerling). */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const input=parseLearnerDetailQuery(id);
 return withSupportAccess(req,{action:'owner.learners.detail',ownerOnly:true,level:2,reason:KAART_INZAGE_REDEN,targetType:'learner_account',meta:input?{user_id:input.userId}:undefined},async({supabase,user})=>{
  if(!input)throw new SupportRequestError('Ongeldig leerling-id.',400);
  const {data,error}=await supabase.rpc('owner_learner_detail',{p_actor:user.id,p_user_id:input.userId});
  if(error)throw new SupportRequestError('De leerlingkaart kan niet worden geladen. Probeer later opnieuw.',503);
  if(!data)throw new SupportRequestError('Geen leerlingaccount gevonden, of het account telt niet mee (test, medewerker of interne school).',404);
  return data;
 });
}
