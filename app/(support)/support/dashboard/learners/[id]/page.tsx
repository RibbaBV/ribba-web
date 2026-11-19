'use client';
import {use,useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../../client';
import {activiteitSamenvatting,learnerFilterLabels,linkOpeningenTekst,vriendStatus,type LearnerDetail,type LearnerFilter} from '@/lib/owner-learners';
import {Empty,Explainer,Footer,Grid,Kpi,Kpis,Note,Page,PageHeader,Panel,Pill,StateMessage,kit} from '../../../ui/kit';
import local from '../learners.module.css';
const dt=(value:string|null|undefined)=>value?new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'}):'—';
const dag=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'});
/** Mount the private learner card only while a current MFA session exists. */
export default function LearnerDetailPage({params}:{params:Promise<{id:string}>}){
 const {id}=use(params);
 const {token,status,isCurrentToken}=useSupportToken();
 return <Page>
  <PageHeader eyebrow="Ribba · alleen eigenaar" title="Leerlingkaart." subtitle="Komt deze leerling terug, en wat doet hij in de app?" actions={<Link href="/support/dashboard/learners">← Terug naar het overzicht</Link>}/>
  {token?<AuthenticatedDetail id={id} token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<SignedOut/>}
 </Page>;
}
function SignedOut(){
 return <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om deze kaart te openen.</p><Link href="/support" className={kit.button}>Inloggen</Link></div>;
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
  {!d&&<StateMessage error={current?.error} onRetry={()=>retry(n=>n+1)}>Leerlingkaart laden…</StateMessage>}
  {d&&<>
   <Kpis>
    <Kpi label="Actieve dagen · 30 dagen" value={d.activity.active_days_30} note="Minstens één scherm of tik"/>
    <Kpi label="Laatste handeling" value={<span className={local.kpiDate}>{dt(d.activity.last_event_at)}</span>} note="Beste maat voor gebruik"/>
    <Kpi label="Theorie afgerond" value={d.theory.topics_completed} note={`${d.theory.topics_visited} onderwerpen bezocht`}/>
    <Kpi label="Via deze leerling" value={d.sharing?d.sharing.referred_accounts:'—'} note={d.sharing?'Accounts met zijn deelcode':'Nog niet gemeten in deze versie'}/>
   </Kpis>
   <Grid>
    <Panel id="wie" title={d.account.name??'Naam niet eenduidig beschikbaar'} note={d.account.email??'Geen e-mailadres beschikbaar'} actions={<Pill tone={d.account.school_state==='active'?'ok':'warn'}>{learnerFilterLabels[d.account.school_state as LearnerFilter]}</Pill>}>
     <dl className={kit.facts}><div><dt>Account aangemaakt</dt><dd>{dt(d.account.registered_at)}</dd></div><div><dt>Laatste login</dt><dd>{dt(d.account.last_sign_in_at)}</dd></div><div><dt>Registratie</dt><dd>{d.account.registration_hint?'Zelfstandig, zonder rijschool':'Via een rijschool'}</dd></div></dl>
     <div className={kit.prose}>
      {d.referred_by&&<p className={kit.note}>Aangemeld via: <Link href={`/support/dashboard/learners/${d.referred_by.user_id}`}>{d.referred_by.name??d.referred_by.email??'onbekend'}</Link>{d.referred_by.name&&d.referred_by.email?` (${d.referred_by.email})`:''} · code {d.referred_by.code} · {dt(d.referred_by.at)}</p>}
      {d.account.schools.map((s,i)=><p key={`${s.id}-${i}`}><Link href={`/support/${s.id}`}>{s.name}</Link> · {learnerFilterLabels[s.status as LearnerFilter]??s.status}</p>)}
     </div>
    </Panel>
    <Panel id="terug" title="Komt hij terug?" note={activiteitSamenvatting(d.activity)}>
     <div className={local.spark} role="img" aria-label={`Handelingen per dag, laatste 30 dagen; ${d.activity.active_days_30} actieve dagen.`}>{d.activity.days.map(x=><div key={x.day} data-actief={x.events>0||undefined} title={`${dag(x.day)}: ${x.events} handelingen, ${x.screens} schermen`} style={{height:`${Math.max(6,x.events/max*100)}%`}}/>)}</div>
     <Note>Gemeten sinds {d.activity.measured_since}; eerdere dagen zijn onbekend, niet leeg. Een dag telt als actief bij minstens één scherm of tik.</Note>
    </Panel>
   </Grid>
   <Panel id="wat" title="Wat doet hij?" note={d.activity.top_screens.length>0?`Meest geopend: ${d.activity.top_screens.slice(0,5).map(t=>`${t.scherm??'onbekend'} (${t.keer}×)`).join(' · ')}`:undefined}>
    {d.activity.per_day.length===0?<Empty>Geen handelingen in de laatste 30 dagen.</Empty>:
     <ol className={kit.timeline}>{d.activity.per_day.map(day=><li key={day.day}><time dateTime={day.day}>{dag(day.day)}</time><div className={kit.prose}>{day.items.map((it,i)=><p key={i}>{it.soort==='scherm'?'Scherm':'Tik'} · {it.scherm??'onbekend'}{it.element?` › ${it.element}`:''} · {it.keer}×</p>)}</div></li>)}</ol>}
   </Panel>
   <Panel id="theorie" title="Theorie">
     <dl className={kit.facts}><div><dt>Onderwerpen bezocht</dt><dd>{d.theory.topics_visited}</dd></div><div><dt>Afgerond</dt><dd>{d.theory.topics_completed}</dd></div><div><dt>Laatste bezoek</dt><dd>{dt(d.theory.last_visit)}</dd></div></dl>
   </Panel>
   {d.sharing&&<Panel id="delen" title="Delen">
     {!d.sharing.code?<Empty>{linkOpeningenTekst(d.sharing)}</Empty>:<>
      <dl className={kit.facts}><div><dt>Deelcode</dt><dd className={local.code}>{d.sharing.code}</dd></div><div><dt>Deelknop getikt (30 d)</dt><dd>{d.sharing.share_taps_30}</dd></div><div><dt>Accounts via deze persoon</dt><dd>{d.sharing.referred_accounts}</dd></div></dl>
      <Note>{linkOpeningenTekst(d.sharing)}</Note>
      {d.sharing.referred.length>0&&<div className={local.rows}>{d.sharing.referred.map(v=><article className={local.row} key={v.user_id}><div><h3><Link href={`/support/dashboard/learners/${v.user_id}`}>{v.email??'Geen e-mailadres beschikbaar'}</Link></h3><p>{vriendStatus(v)}</p></div><dl className={kit.facts}><div><dt>Account aangemaakt</dt><dd>{dt(v.registered_at)}</dd></div><div><dt>Eerste handeling</dt><dd>{dt(v.first_event_at)}</dd></div><div><dt>Laatste handeling</dt><dd>{dt(v.last_event_at)}</dd></div></dl></article>)}</div>}
      <Note>Aan hoeveel personen de link is gestuurd, weet de telefoon niet. Geopende links en accounts met deze code zijn het dichtste erbij; wie de code niet invult, telt niet mee.</Note>
     </>}
   </Panel>}
   <Footer>Bijgewerkt: {dt(d.captured_at)}.</Footer>
   <Explainer title="Wat meten we precies?"><p>Schermen en tikken komen uit de app (bewaard 90 dagen, sinds {d.activity.measured_since}). Geen ingetypte tekst, locatie of IP. Eigen proeven vanuit de ontwikkelversie tellen niet mee. Dagen zijn in Nederlandse tijd.</p><p>Laatste login verandert alleen bij een nieuwe sessie; laatste handeling is de betere maat voor gebruik. Theorievoortgang telt bezochte paragrafen, niet of iemand ze begreep.</p></Explainer>
  </>}
 </>;
}
