'use client';
import {use,useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../../client';
import {activiteitSamenvatting,learnerFilterLabels,type LearnerDetail,type LearnerFilter} from '@/lib/owner-learners';
import styles from '../../../support-design.module.css';
import local from '../learners.module.css';
const dt=(value:string|null|undefined)=>value?new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'}):'—';
const dag=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
/** Mount the private learner card only while a current MFA session exists. */
export default function LearnerDetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params);
 const {token,status,isCurrentToken}=useSupportToken();
 return <main className={styles.page}><div className={styles.content}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>RIBBA · ALLEEN EIGENAAR</p><h1>Leerlingkaart.</h1><p className={styles.subtitle}>Komt deze leerling terug, en wat doet hij in de app? <Link href="/support/dashboard/learners">Terug naar het overzicht</Link></p></div></header>
  {token?<AuthenticatedDetail id={id} token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<SignedOut/>}
 </div></main>;
}
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om deze kaart te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>;
}
/** Request and card live below the session boundary so signout unmounts all private state. The card loads at once; the server logs the fixed reason. */
function AuthenticatedDetail({id,token,isCurrentToken}:{id:string;token:string;isCurrentToken:(token:string)=>boolean}){
 const [attempt,retry]=useState(0);
 // Eén sleutel per poging; de kaart hoort bij precies die sleutel, zodat een
 // oude respons nooit over een nieuwe sessie heen valt.
 const key=`${token}:${attempt}`;
 const [card,setCard]=useState<{key:string;data?:LearnerDetail;error?:string}|null>(null);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  void fetch(`/api/support/dashboard/learners/${encodeURIComponent(id)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setCard({key,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setCard({key,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[id,token,key,isCurrentToken]);
 const current=card?.key===key?card:null;
 const d=current?.data;
 const max=d?Math.max(1,...d.activity.days.map(x=>x.events)):1;
 return <>
  {!d&&<div role="status"><p>{current?.error??'Leerlingkaart laden…'}</p>{current?.error&&<button className={styles.quietButton} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>}
  {d&&<>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="wie"><h2 id="wie">{d.account.name??'Naam niet eenduidig beschikbaar'}</h2>
    <p>{d.account.email??'Geen e-mailadres beschikbaar'} · <span className={styles.badgeAttention}>{learnerFilterLabels[d.account.school_state as LearnerFilter]}</span></p>
    <dl><div><dt>Account aangemaakt</dt><dd>{dt(d.account.registered_at)}</dd></div><div><dt>Laatste login</dt><dd>{dt(d.account.last_sign_in_at)}</dd></div><div><dt>Laatste handeling</dt><dd>{dt(d.activity.last_event_at)}</dd></div><div><dt>Registratie</dt><dd>{d.account.registration_hint?'Zelfstandig, zonder rijschool':'Via een rijschool'}</dd></div></dl>
    {d.account.schools.length>0&&<div>{d.account.schools.map((s,i)=><p key={`${s.id}-${i}`}><Link href={`/support/${s.id}`}>{s.name}</Link> · {learnerFilterLabels[s.status as LearnerFilter]??s.status}</p>)}</div>}
   </section>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="terug"><h2 id="terug">Komt hij terug?</h2><p className={styles.subtitle}>{activiteitSamenvatting(d.activity)}</p>
    <div role="img" aria-label={`Handelingen per dag, laatste 30 dagen; ${d.activity.active_days_30} actieve dagen.`} style={{display:'grid',gridTemplateColumns:'repeat(30,1fr)',gap:3,alignItems:'end',height:64}}>{d.activity.days.map(x=><div key={x.day} title={`${dag(x.day)}: ${x.events} handelingen, ${x.screens} schermen`} style={{height:`${Math.max(6,x.events/max*100)}%`,borderRadius:3,background:x.events?'var(--accent, #2563EB)':'var(--border, #E2E8F0)',opacity:x.events?1:.6}}/>)}</div>
    <p className={styles.subtitle}>Gemeten sinds {d.activity.measured_since}; eerdere dagen zijn onbekend, niet leeg. Een dag telt als actief bij minstens één scherm of tik.</p>
   </section>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="wat"><h2 id="wat">Wat doet hij?</h2>
    {d.activity.per_day.length===0?<p className={styles.empty}>Geen handelingen in de laatste 30 dagen.</p>:<>
     {d.activity.top_screens.length>0&&<p className={styles.subtitle}>Meest geopend: {d.activity.top_screens.slice(0,5).map(t=>`${t.scherm??'onbekend'} (${t.keer}×)`).join(' · ')}</p>}
     <div className={local.rows}>{d.activity.per_day.map(day=><article className={local.row} key={day.day}><div><h3>{dag(day.day)}</h3></div><div>{day.items.map((it,i)=><p key={i}>{it.soort==='scherm'?'Scherm':'Tik'} · {it.scherm??'onbekend'}{it.element?` › ${it.element}`:''} · {it.keer}×</p>)}</div></article>)}</div>
    </>}
   </section>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="theorie"><h2 id="theorie">Theorie</h2>
    <dl><div><dt>Onderwerpen bezocht</dt><dd>{d.theory.topics_visited}</dd></div><div><dt>Afgerond</dt><dd>{d.theory.topics_completed}</dd></div><div><dt>Laatste bezoek</dt><dd>{dt(d.theory.last_visit)}</dd></div></dl>
   </section>
   <details className={`${styles.schoolPanel} ${local.panel}`}><summary>Wat meten we precies?</summary><p>Schermen en tikken komen uit de app (bewaard 90 dagen, sinds {d.activity.measured_since}). Geen ingetypte tekst, locatie of IP. Eigen proeven vanuit de ontwikkelversie tellen niet mee. Dagen zijn in Nederlandse tijd.</p><p>Laatste login verandert alleen bij een nieuwe sessie; laatste handeling is de betere maat voor gebruik. Theorievoortgang telt bezochte paragrafen, niet of iemand ze begreep.</p><p>Bijgewerkt: {dt(d.captured_at)}.</p></details>
  </>}
 </>;
}
