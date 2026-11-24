'use client';
import {useEffect,useState} from 'react';
import MarketingOverview from './MarketingOverview';
import {marketingLabels} from '@/lib/learner-marketing';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {learnerFilters,learnerFilterLabels,zelfAangemeldUitleg,type LearnerFilter,type LearnerList,type LearnerSummary} from '@/lib/owner-learners';
import {Button,Empty,Explainer,Footer,Kpi,Kpis,Note,Page,PageHeader,Panel,Pill,StateMessage} from '../../ui/kit';
import k from '../../ui/kit.module.css';
import local from './learners.module.css';
const date=(value:string|null)=>value?new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'}):'Nog niet ingelogd';
/** Mount the private overview only while a current MFA session exists. */
export default function LearnersPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <Page><div>
  <PageHeader eyebrow="Ribba · alleen eigenaar" title="Leerlinghulp en toestemming." subtitle="Help bij een onvolledig profiel, zoek een leerlingkaart en bekijk toestemming voor e-mail."/>
  {token?<AuthenticatedLearners token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<SignedOut/>}
 </div></Page>;
}
/** Without a current MFA session the shell hides its navigation, so this page must offer the way back to the login itself. */
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om dit overzicht te openen.</p><Link href="/support" className={k.button}>Inloggen</Link></div>;
}
/** Keep queries, rows and requests inside the session boundary so signout unmounts all private state. */
function AuthenticatedLearners({token,isCurrentToken}:{token:string;isCurrentToken:(token:string)=>boolean}){
 const [attempt,retry]=useState(0);
 const [summary,setSummary]=useState<{token:string;data?:LearnerSummary;error?:string}|null>(null);
 const [filter,setFilter]=useState<LearnerFilter>('never_signed_in');
 const [query,setQuery]=useState('');
 const [request,setRequest]=useState<{token:string;filter:LearnerFilter;query:string;page:number}|null>(null);
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
  void fetch('/api/support/dashboard/learners',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({filter:request.filter,query:request.query,page:request.page}),cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,...(res.ok?{data:body}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[token,request,isCurrentToken]);
 const visible=summary?.token===token?summary:null;
 const current=request?.token===token&&list?.request===request?list:null;
 const data=visible?.data;const rows=current?.data;
 const loading=!!request&&request.token===token&&!current;
 return <>{!data?<StateMessage error={visible?.error} onRetry={()=>retry(n=>n+1)}>Leerlingmetingen laden…</StateMessage>:<>
   <Kpis>
    <Kpi label="Onvolledig profiel zonder school" value={data.metrics.incomplete_without_school} note="Zelfstandig profiel nog niet volledig ingevuld"/>
    <Kpi label="Nog niet ingelogd" value={data.metrics.never_signed_in} note="Account bestaat, nog geen login geregistreerd"/>
    <Kpi label="Zelf aangemeld · zonder uitnodiging" value={data.metrics.registration_hint} note={zelfAangemeldUitleg(data.metrics)}/>
   </Kpis>
   <MarketingOverview token={token} isCurrentToken={isCurrentToken}/>
   <Panel id="list-title" title="Leerlingkaart zoeken" note="Naam en e-mailadres zijn persoonsgegevens; elke inzage wordt automatisch vastgelegd. Klik op een naam voor de leerlingkaart.">
    <form className={k.form} onSubmit={e=>{e.preventDefault();if(token)setRequest({token,filter,query:query.trim(),page:0});}}>
     <label className={k.field}>Toon<select value={filter} onChange={e=>setFilter(e.target.value as LearnerFilter)}>{learnerFilters.map(f=><option key={f} value={f}>{learnerFilterLabels[f]}</option>)}</select></label>
     <label className={k.field}>Zoek op naam of e-mailadres (optioneel)<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} autoComplete="off"/></label>
     <div className={k.formEnd}><Button primary type="submit" disabled={loading}>{loading?'Laden…':'Lijst bekijken'}</Button></div>
    </form>
    {current?.error&&<p role="alert" className={k.text_bad}>{current.error}</p>}
    {rows&&<><Note>{rows.total} accounts · {learnerFilterLabels[request!.filter]}{request!.query?` · Zoekterm: ${request!.query}`:''}</Note>
     {rows.rows.length===0?<Empty>Geen leerlingaccounts gevonden met deze filters.</Empty>:<div className={local.rows}>{rows.rows.map(row=><article className={local.row} key={row.user_id}>
      <div><h3><Link href={`/support/dashboard/learners/${row.user_id}`}>{row.name??'Naam niet eenduidig beschikbaar'}</Link></h3>{row.name_source==='school_record'&&<small>Naam uit gekoppelde schoolkaart</small>}<p>{row.email??'Geen e-mailadres beschikbaar'}</p><Pill tone={row.school_state==='active'?'ok':'warn'}>{learnerFilterLabels[row.school_state]}</Pill></div>
      <dl className={k.facts}>{row.marketing&&<div><dt>Marketingmails</dt><dd>{marketingLabels[row.marketing.status]}{row.marketing.status==='granted'&&!row.marketing.eligible?' · momenteel niet bruikbaar':''}</dd></div>}<div><dt>Account aangemaakt</dt><dd>{date(row.registered_at)}</dd></div><div><dt>Laatste login</dt><dd>{date(row.last_sign_in_at)}</dd></div><div><dt>Zelfstandig profiel</dt><dd>{row.profile_complete?'Alle velden ingevuld':row.school_state==='active'?'Niet volledig · school beheert eigen gegevens':'Nog niet volledig'}</dd></div></dl>
      <div>{row.schools.map((school,i)=><p key={`${school.id}-${i}`}><Link href={`/support/${school.id}`}>{school.name}</Link> · {school.status==='suspended'?'Geschorst':learnerFilterLabels[school.status as LearnerFilter]??'Onbekende status'}</p>)}{row.registration_hint&&<small>Markering zelfstandige registratie aanwezig</small>}</div>
     </article>)}</div>}
     <div className={local.pager}><Button disabled={rows.page===0||loading} onClick={()=>setRequest({...request!,page:rows.page-1})}>Vorige</Button><span>Pagina {rows.page+1} van {Math.max(1,Math.ceil(rows.total/rows.page_size))}</span><Button disabled={(rows.page+1)*rows.page_size>=rows.total||loading} onClick={()=>setRequest({...request!,page:rows.page+1})}>Volgende</Button><Button onClick={()=>{setRequest(null);setList(null);}}>Lijst sluiten</Button></div>
    </>}
   </Panel>
   <Footer>Bijgewerkt: {date(data.captured_at)}. Er worden geen leerlingnamen of e-mailadressen naar AI gestuurd.</Footer>
   <Explainer title="Wat meten we precies?"><p>Accounts zijn geen downloads. Laatste login bewijst geen actief appgebruik; een activatielink kan ook een sessie starten. Het exacte eerste loginmoment is niet beschikbaar.</p><p>Een leerling zonder actieve school kan op de wachtlijst staan, geslaagd of gestopt zijn. Geen schoolkoppeling betekent geen huidige schoolrij, niet bewezen dat iemand nooit een school had.</p><p>De zelfstandige registratiemarkering is een aanwijzing uit accountgegevens, geen bewezen herkomst. {data.metrics.hint_with_active_school} accounts met die markering hebben nu een actieve school; dat is geen gemeten conversiepercentage.</p><p>Platformmedewerkers, expliciet gemarkeerde testaccounts en accounts die uitsluitend aan interne scholen zijn gekoppeld tellen niet mee. Nog onbekende testaccounts kunnen in de lijst staan. Verwijderde accounts verdwijnen uit de tellingen, ook uit historische registratiedagen.</p></Explainer>
  </>}
 </>;
}
