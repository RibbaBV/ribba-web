'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {signupWeekOptions,type SignupWeekOption,type SignupWeeks} from '@/lib/owner-signups';
import {Dashboard} from './dashboard';
import {Page,PageHeader,Segmented,StateMessage} from '../../ui/kit';
/** Mount the private overview only while a current MFA session exists. */
export default function SignupsPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 const [weeks,setWeeks]=useState<SignupWeekOption>(12);
 return <Page>
  <PageHeader eyebrow="Ribba · alleen eigenaar" title="Inschrijvingen." subtitle="Welke rijscholen zich via de website inschreven, en hoeveel er klant werden."
   actions={token?<Segmented label="Periode" options={signupWeekOptions} value={weeks} onChange={setWeeks} format={w=>`${w} weken`}/>:undefined}/>
  {token?<AuthenticatedSignups token={token} weeks={weeks} isCurrentToken={isCurrentToken}/>:status==='laden'?<StateMessage>Sessie controleren…</StateMessage>:<SignedOut/>}
 </Page>;
}
/** Without a current MFA session the shell hides its navigation, so this page must offer the way back to the login itself. */
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om dit overzicht te openen.</p><Link href="/support">Inloggen</Link></div>;
}
/** Keep requests and data inside the session boundary so signout unmounts all private state. */
function AuthenticatedSignups({token,weeks,isCurrentToken}:{token:string;weeks:SignupWeekOption;isCurrentToken:(token:string)=>boolean}){
 const [attempt,retry]=useState(0);
 const [result,setResult]=useState<{key:string;data?:SignupWeeks;error?:string}|null>(null);
 const key=`${token}:${weeks}:${attempt}`;
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/support/dashboard/signups?weeks=${weeks}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({key,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({key,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[token,weeks,attempt,key,isCurrentToken]);
 const current=result?.key===key?result:null;
 const data=current?.data;
 return !data?<StateMessage error={current?.error} onRetry={()=>retry(n=>n+1)}>Inschrijvingen laden…</StateMessage>:<Dashboard data={data}/>;
}
