'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {activationRate,checkoutRate,payingRate,signupFields,signupLabels,signupWeekOptions,weekLabel,type SignupWeekOption,type SignupWeeks} from '@/lib/owner-signups';
import styles from '../../support-design.module.css';
import local from './inschrijvingen.module.css';
const date=(value:string)=>new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'});
const pct=(value:number|null)=>value===null?'—':`${value}%`;
/** Mount the private overview only while a current MFA session exists. */
export default function SignupsPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <main className={styles.page}><div className={styles.content}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>RIBBA · ALLEEN EIGENAAR</p><h1>Inschrijvingen per week.</h1><p className={styles.subtitle}>Hoeveel rijscholen begonnen aan een inschrijving, en hoe ver kwamen ze. Zo zie je of de outreach iets oplevert.</p></div></header>
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
  <div className={local.period} role="group" aria-label="Periode">{signupWeekOptions.map(w=><button key={w} className={styles.quietButton} aria-pressed={w===weeks} onClick={()=>setWeeks(w)}>{w} weken</button>)}</div>
  {!data?<div role="status"><p>{current?.error??'Weekoverzicht laden…'}</p>{current?.error&&<button className={styles.quietButton} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>:<>
   <div className={`${styles.stats} ${local.stats6}`}>
    <article className={styles.stat}><span>Gestart</span><strong>{data.totals.started}</strong><small>Inschrijving begonnen</small></article>
    <article className={styles.stat}><span>Betaalgegevens ingevuld</span><strong>{data.totals.checkout}</strong><small>{pct(checkoutRate(data.totals))} van gestart</small></article>
    <article className={styles.stat}><span>Afgehaakt</span><strong>{data.totals.abandoned}</strong><small>{data.totals.open} nog open</small></article>
    <article className={styles.stat}><span>Actief</span><strong>{data.totals.activated}</strong><small>{pct(activationRate(data.totals))} van gestart</small></article>
    <article className={styles.stat}><span>In proef</span><strong>{data.totals.trialing}</strong><small>Stand van vandaag</small></article>
    <article className={styles.stat}><span>Betalend</span><strong>{data.totals.paying}</strong><small>{pct(payingRate(data.totals))} van actief</small></article>
   </div>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="weeks-title"><h2 id="weeks-title">Per week waarin de inschrijving begon</h2>
    <div className={local.tableWrap}><table className={local.table}>
     <thead><tr><th scope="col">Week</th>{signupFields.map(f=><th scope="col" key={f}>{signupLabels[f]}</th>)}</tr></thead>
     <tbody>{data.weeks.map(w=><tr key={w.week_start} className={w.started===0?local.zero:undefined}><th scope="row">{weekLabel(w.week_start)}</th>{signupFields.map(f=><td key={f}>{w[f]}</td>)}</tr>)}</tbody>
    </table></div>
    <p>Afgehaakt = na {data.abandon_after_days} dagen nog geen betaalgegevens. Proef, betalend en gestopt zijn de stand van vandaag voor de scholen die in die week begonnen. {data.excluded_tests} {data.excluded_tests===1?'testinschrijving':'testinschrijvingen'} niet meegeteld.</p>
    <p>Bijgewerkt: {date(data.captured_at)}. Weken lopen van maandag tot en met zondag, Nederlandse tijd.</p>
   </section>
  </>}
 </>;
}
