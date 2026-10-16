import { NextRequest } from 'next/server';
import { withSupportAccess, SupportRequestError } from '@/lib/support-auth';
import { periodFromUrl } from '@/lib/owner-dashboard';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
 return withSupportAccess(req,{action:'owner.dashboard',level:0,ownerOnly:true},async({supabase,user})=>{
  const days=periodFromUrl(req.url);
  if(days===null) throw new SupportRequestError('Kies 7 of 30 dagen.',400);
  const {data,error}=await supabase.rpc('owner_growth_dashboard',{p_actor:user.id,p_days:days});
  if(error) throw new SupportRequestError('De groeimetingen zijn nog niet beschikbaar. Probeer het later opnieuw.',503);
  return data;
 });
}
