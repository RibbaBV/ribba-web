'use client';
import {useEffect,useState} from 'react';
import {useSupportToken} from '../client';
import {type GrowthDashboard} from '@/lib/owner-dashboard';
import DashboardView from './dashboard-view';
type Result={token:string;days:7|30;data?:GrowthDashboard|{status:'collecting'};error?:string};
export default function OwnerDashboardPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 const [days,setDays]=useState<7|30>(30);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer);},[]);
 const [result,setResult]=useState<Result|null>(null);
 const [attempt,setAttempt]=useState(0);
 const [ai,setAi]=useState<{token:string;days:number;busy:boolean;error?:string;value?:GrowthDashboard['latest_ai']}|null>(null);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  void (async()=>{
   try{
    const res=await fetch(`/api/support/dashboard?days=${days}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'});
    const body=await res.json();
    if(controller.signal.aborted||!isCurrentToken(token))return;
    setResult({token,days,...(res.ok?{data:body}:{error:res.status===403?'Dit dashboard is alleen toegankelijk voor de eigenaar.':body.error??'Ophalen mislukt.'})});
   }catch{if(!controller.signal.aborted&&isCurrentToken(token))setResult({token,days,error:'De gegevens konden niet worden geladen.'});}
  })();
  return()=>controller.abort();
 },[token,days,attempt,isCurrentToken]);
 const visible=result?.token===token&&result.days===days?result:null;
 const data=visible?.data?.status==='ready'?visible.data:null;
 const aiState=ai?.token===token&&ai.days===days?ai:null;
 const insight=aiState?.value??data?.latest_ai;
 const stale=!!data&&now-Date.parse(data.captured_at)>30*3600000;
 async function propose(){
  if(!token||!data)return;
  const requestToken=token;
  setAi({token,days,busy:true});
  try{
   const res=await fetch(`/api/support/dashboard/insights?days=${days}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   const body=await res.json();
   if(!isCurrentToken(requestToken))return;
   setAi({token:requestToken,days,busy:false,...(res.ok?{value:body}:{error:body.error??'AI-voorstellen konden niet worden geladen.'})});
  }catch{if(isCurrentToken(requestToken))setAi({token:requestToken,days,busy:false,error:'Geen verbinding. Probeer later opnieuw.'});}
 }
 return <DashboardView data={data} error={visible?.error} collecting={visible?.data?.status==='collecting'} unauthorized={status==='geen-toegang'} days={days} onDays={n=>{setDays(n);setAi(null);}} onRetry={()=>setAttempt(n=>n+1)} insight={insight} aiBusy={!!aiState?.busy} aiError={aiState?.error} stale={stale} onPropose={propose}/>;
}
