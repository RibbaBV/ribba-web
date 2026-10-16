import {NextRequest} from 'next/server';
import {withSupportAccess,SupportRequestError} from '@/lib/support-auth';
import {isUuid,parseCaseRequest} from '@/lib/owner-journey';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const school=new URL(req.url).searchParams.get('school');
 return withSupportAccess(req,{action:'owner.journey.read',level:0,ownerOnly:true,targetSchoolId:isUuid(school)?school:undefined},async({supabase,user})=>{
  if(school!==null&&!isUuid(school))throw new SupportRequestError('Ongeldige rijschool.',400);
  const {data,error}=await supabase.rpc('owner_school_journey',{p_actor:user.id,p_school:school});
  if(error||!data)throw new SupportRequestError('De klantreis is nog niet beschikbaar. Probeer het later opnieuw.',503);
  if(data.status==='not_found')throw new SupportRequestError('Rijschool niet gevonden.',404);
  return data;
 });
}
export async function POST(req:NextRequest){
 return withSupportAccess(req,{action:'owner.support_case.save',level:0,ownerOnly:true},async({supabase,user})=>{
  let raw:string;
  try{raw=await req.text();}catch{throw new SupportRequestError('Ongeldige registratie.',400);}
  if(raw.length>4096)throw new SupportRequestError('Registratie is te groot.',413);
  let body:ReturnType<typeof parseCaseRequest>;
  try{body=parseCaseRequest(JSON.parse(raw));}catch{body=null;}
  if(!body)throw new SupportRequestError('Controleer de ingevulde velden.',400);
  const {data,error}=await supabase.rpc('owner_save_support_case',{p_actor:user.id,p_school:body.school_id,p_id:body.id,p_revision:body.revision,p_case:body.case});
  if(error||!data)throw new SupportRequestError('Opslaan is niet bevestigd. Probeer opnieuw; dezelfde registratie wordt niet dubbel opgeslagen.',503);
  if(data.status==='conflict')throw new SupportRequestError('Deze registratie is inmiddels gewijzigd. Laad de gegevens opnieuw.',409);
  if(data.status==='not_found')throw new SupportRequestError('Rijschool niet gevonden.',404);
  return data;
 });
}
