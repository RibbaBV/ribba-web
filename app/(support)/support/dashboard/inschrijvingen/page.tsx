'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {signupWeekOptions,type SignupWeekOption,type SignupWeeks} from '@/lib/owner-signups';
import {Dashboard} from './dashboard';
import styles from '../../support-design.module.css';
import local from './inschrijvingen.module.css';
/** Mount the private overview only while a current MFA session exists. */
export default function SignupsPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <main className={styles.page}><div className={styles.content}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>RIBBA · ALLEEN EIGENAAR</p><h1>Inschrijvingen.</h1><p className={styles.subtitle}>Welke rijscholen zich via de website inschreven, en hoeveel er klant werden.</p></div></header>
  {token?<AuthenticatedSignups token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<SignedOut/>}
 </div></main>;
}
/** Without a current MFA session the shell hides its navigation, so this page must offer the way back to the login itself. */
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om dit overzicht te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>;
}
/** Keep requests and data inside the session boundary so signout unmounts all private state. */
function AuthenticatedSignups({token,isCurrentToken}:{token:string;isCurrentToken:(token:string)=>boolean}){
 const [weeks,setWeeks]=useState<SignupWeekOption>(12);
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
 return <>
  <div className={`${styles.segmented} ${local.period}`} role="group" aria-label="Periode">{signupWeekOptions.map(w=><button key={w} aria-pressed={w===weeks} onClick={()=>setWeeks(w)}>{w} weken</button>)}</div>
  {!data?<div role="status"><p>{current?.error??'Inschrijvingen laden…'}</p>{current?.error&&<button className={styles.quietButton} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>:<Dashboard data={data}/>}
 </>;
}
