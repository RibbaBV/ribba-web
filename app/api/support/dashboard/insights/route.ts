import { NextRequest } from 'next/server';
import { withSupportAccess,SupportRequestError } from '@/lib/support-auth';
import { periodFromUrl,growthEvidence,type GrowthDashboard } from '@/lib/owner-dashboard';
import { generateGrowthInsights } from '@/lib/growth-ai';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(req:NextRequest) {
 return withSupportAccess(req,{action:'owner.insights.generate',level:0,ownerOnly:true},async({supabase,user})=>{
  const days=periodFromUrl(req.url);
  if(days===null) throw new SupportRequestError('Kies 7 of 30 dagen.',400);
  const key=process.env.OPENAI_API_KEY;
  const model=process.env.GROWTH_AI_MODEL;
  if(!key || !model) throw new SupportRequestError('AI-voorstellen zijn nog niet ingesteld. De meetgegevens blijven beschikbaar.',503);
  const {data,error}=await supabase.rpc('owner_growth_dashboard',{p_actor:user.id,p_days:days});
  if(error || data?.status!=='ready') throw new SupportRequestError('Er zijn nog geen meetgegevens voor een voorstel.',503);
  if(Date.now()-Date.parse(data.captured_at)>30*3600000) throw new SupportRequestError('De meetgegevens zijn te oud. Controleer eerst de meettaak.',503);
  // Add only allowlisted aggregates to the provider; school timeline stays private.
  const journey=await supabase.rpc('owner_school_journey',{p_actor:user.id,p_school:null});
  if(!journey.error&&journey.data?.status==='ready')data.journey=journey.data;
  const {data:run,error:claimError}=await supabase.rpc('claim_growth_ai',{p_actor:user.id,p_days:days,p_snapshot_at:data.captured_at,p_model:model});
  if(claimError) throw new SupportRequestError('AI-voorstellen zijn tijdelijk niet beschikbaar.',503);
  if(!run) throw new SupportRequestError('Er kan één analyse per 10 minuten draaien, maximaal vier per 24 uur. Probeer later opnieuw.',429);
  try {
   const generated=await generateGrowthInsights(data as GrowthDashboard,key,model);
   const result={...generated,evidence:growthEvidence(data as GrowthDashboard)};
   const saved=await supabase.rpc('finish_growth_ai',{p_actor:user.id,p_run:run,p_result:result});
   if(saved.error) throw new Error('Save failed');
   return {created_at:new Date().toISOString(),snapshot_at:data.captured_at,result};
  } catch {
   await supabase.rpc('finish_growth_ai',{p_actor:user.id,p_run:run,p_result:null});
   throw new SupportRequestError('AI kon geen betrouwbaar voorstel leveren. Je meetgegevens zijn behouden.',502);
  }
 });
}
