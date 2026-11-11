'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {learnerFilters,learnerFilterLabels,zelfAangemeldUitleg,type LearnerFilter,type LearnerList,type LearnerSummary} from '@/lib/owner-learners';
import styles from '../../support-design.module.css';
import local from './learners.module.css';
const date=(value:string|null)=>value?new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'}):'Nog niet ingelogd';
/** Mount the private overview only while a current MFA session exists. */
export default function LearnersPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <main className={styles.page}><div className={styles.content}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>RIBBA · ALLEEN EIGENAAR</p><h1>Leerlingen in beeld.</h1><p className={styles.subtitle}>Van account naar een rijschool. Zie waar leerlingen staan en waar hulp nodig kan zijn.</p></div></header>
  {token?<AuthenticatedLearners token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<SignedOut/>}
 </div></main>;
}
/** Without a current MFA session the shell hides its navigation, so this page must offer the way back to the login itself. */
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om dit overzicht te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>;
}
/** Keep queries, reasons, rows and requests inside the session boundary so signout unmounts all private state. */
function AuthenticatedLearners({token,isCurrentToken}:{token:string;isCurrentToken:(token:string)=>boolean}){
 const [attempt,retry]=useState(0);
 const [summary,setSummary]=useState<{token:string;data?:LearnerSummary;error?:string}|null>(null);
 const [filter,setFilter]=useState<LearnerFilter>('without_active');
 const [query,setQuery]=useState('');const [reason,setReason]=useState('');
 const [request,setRequest]=useState<{token:string;filter:LearnerFilter;query:string;reason:string;page:number}|null>(null);
 const [list,setList]=useState<{request:typeof request;data?:LearnerList;error?:string}|null>(null);
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  void fetch('/api/support/dashboard/learners',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setSummary({token,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setSummary({token,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[token,attempt,isCurrentToken]);
 useEffect(()=>{
  if(!request||!token||request.token!==token)return;
  const controller=new AbortController();
  void fetch('/api/support/dashboard/learners',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({filter:request.filter,query:request.query,reason:request.reason,page:request.page}),cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[token,request,isCurrentToken]);
 const visible=summary?.token===token?summary:null;
 const current=request?.token===token&&list?.request===request?list:null;
 const data=visible?.data;const rows=current?.data;
 const loading=!!request&&request.token===token&&!current;
 return <>{!data?<div role="status"><p>{visible?.error??'Leerlingmetingen laden…'}</p>{visible?.error&&<button className={styles.quietButton} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>:<>
   <div className={`${styles.stats} ${local.stats4}`}>
    <article className={styles.stat}><span>Nieuwe accounts · 30 dagen</span><strong>{data.metrics.new_30}</strong><small>{data.metrics.previous_new_30} in de 30 dagen daarvoor</small></article>
    <article className={styles.stat}><span>Zonder actieve rijschool</span><strong>{data.metrics.without_active_school}</strong><small>{data.metrics.no_school} zonder schoolkoppeling · {data.metrics.waitlist} op de wachtlijst</small></article>
    <article className={styles.stat}><span>Nog niet ingelogd</span><strong>{data.metrics.never_signed_in}</strong><small>Account bestaat, nog geen login geregistreerd</small></article>
    <article className={styles.stat} data-zelf-aangemeld><span>Zelf aangemeld · zonder uitnodiging</span><strong>{data.metrics.registration_hint}</strong><small>{zelfAangemeldUitleg(data.metrics)}</small></article>
   </div>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="growth-title"><h2 id="growth-title">Registraties · laatste 30 dagen</h2><div className={local.chart} role="img" aria-label={`Registraties per dag; totaal ${data.trend.reduce((sum,d)=>sum+d.accounts,0)} op deze 30 kalenderdagen. De exacte aantallen staan onder Dagcijfers.`}>{data.trend.map(d=><div key={d.day} title={`${d.day}: ${d.accounts}`} style={{height:`${Math.max(3,d.accounts/Math.max(1,...data.trend.map(t=>t.accounts))*100)}%`,opacity:d.accounts?1:.25}}/>)}</div>
    <details><summary>Dagcijfers bekijken</summary><div className={local.days}>{data.trend.map(d=><span key={d.day}>{d.day}: <b>{d.accounts}</b></span>)}</div></details>
    <p className={styles.subtitle}>{data.metrics.accounts} leerlingaccounts · {data.metrics.signed_in_30} met een login in de laatste 30 dagen. {data.metrics.incomplete_without_school} zonder actieve school hebben nog een onvolledig zelfstandig profiel.</p>
   </section>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="list-title"><h2 id="list-title">Leerlingenlijst</h2><p className={styles.subtitle}>Naam en e-mailadres zijn persoonsgegevens. Geef aan waarom je deze lijst bekijkt; je inzage wordt vastgelegd. Zet geen leerlinggegevens in de reden.</p>
    <form className={local.form} onSubmit={e=>{e.preventDefault();if(token)setRequest({token,filter,query:query.trim(),reason:reason.trim(),page:0});}}>
     <label>Toon<select value={filter} onChange={e=>setFilter(e.target.value as LearnerFilter)}>{learnerFilters.map(f=><option key={f} value={f}>{learnerFilterLabels[f]}</option>)}</select></label>
     <label>Zoek op naam of e-mailadres<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} autoComplete="off"/></label>
     <label className={local.reason}>Reden voor inzage<input value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={300} required placeholder="Bijvoorbeeld: controleren wie hulp nodig heeft bij registratie" autoComplete="off"/></label>
     <button className={styles.quietButton} disabled={reason.trim().length<10||loading}>{loading?'Laden…':'Lijst bekijken'}</button>
    </form>
    {current?.error&&<p role="alert" className={styles.error}>{current.error}</p>}
    {rows&&<><p className={styles.subtitle}>{rows.total} accounts · {learnerFilterLabels[request!.filter]}{request!.query?` · Zoekterm: ${request!.query}`:''}</p>
     {rows.rows.length===0?<p className={styles.empty}>Geen leerlingaccounts gevonden met deze filters.</p>:<div className={local.rows}>{rows.rows.map(row=><article className={local.row} key={row.user_id}>
      <div><h3>{row.name??'Naam niet eenduidig beschikbaar'}</h3>{row.name_source==='school_record'&&<small>Naam uit gekoppelde schoolkaart</small>}<p>{row.email??'Geen e-mailadres beschikbaar'}</p><span className={styles.badgeAttention}>{learnerFilterLabels[row.school_state]}</span></div>
      <dl><div><dt>Account aangemaakt</dt><dd>{date(row.registered_at)}</dd></div><div><dt>Laatste login</dt><dd>{date(row.last_sign_in_at)}</dd></div><div><dt>Zelfstandig profiel</dt><dd>{row.profile_complete?'Alle velden ingevuld':row.school_state==='active'?'Niet volledig · school beheert eigen gegevens':'Nog niet volledig'}</dd></div></dl>
      <div>{row.schools.map((school,i)=><p key={`${school.id}-${i}`}><Link href={`/support/${school.id}`}>{school.name}</Link> · {school.status==='suspended'?'Geschorst':learnerFilterLabels[school.status as LearnerFilter]??'Onbekende status'}</p>)}{row.registration_hint&&<small>Markering zelfstandige registratie aanwezig</small>}</div>
     </article>)}</div>}
     <div className={local.pager}><button className={styles.quietButton} disabled={rows.page===0||loading} onClick={()=>setRequest({...request!,page:rows.page-1})}>Vorige</button><span>Pagina {rows.page+1} van {Math.max(1,Math.ceil(rows.total/rows.page_size))}</span><button className={styles.quietButton} disabled={(rows.page+1)*rows.page_size>=rows.total||loading} onClick={()=>setRequest({...request!,page:rows.page+1})}>Volgende</button><button className={styles.quietButton} onClick={()=>{setRequest(null);setList(null);}}>Lijst sluiten</button></div>
    </>}
   </section>
   <details className={`${styles.schoolPanel} ${local.panel}`}><summary>Wat meten we precies?</summary><p>Accounts zijn geen downloads. Laatste login bewijst geen actief appgebruik; een activatielink kan ook een sessie starten. Het exacte eerste loginmoment is niet beschikbaar.</p><p>Een leerling zonder actieve school kan op de wachtlijst staan, geslaagd of gestopt zijn. Geen schoolkoppeling betekent geen huidige schoolrij, niet bewezen dat iemand nooit een school had.</p><p>De zelfstandige registratiemarkering is een aanwijzing uit accountgegevens, geen bewezen herkomst. {data.metrics.hint_with_active_school} accounts met die markering hebben nu een actieve school; dat is geen gemeten conversiepercentage.</p><p>Platformmedewerkers, expliciet gemarkeerde testaccounts en accounts die uitsluitend aan interne scholen zijn gekoppeld tellen niet mee. Nog onbekende testaccounts kunnen in de lijst staan. Verwijderde accounts verdwijnen uit de tellingen, ook uit historische registratiedagen.</p><p>Bijgewerkt: {date(data.captured_at)}. Er worden geen leerlingnamen of e-mailadressen naar AI gestuurd.</p></details>
  </>}
 </>;
}
