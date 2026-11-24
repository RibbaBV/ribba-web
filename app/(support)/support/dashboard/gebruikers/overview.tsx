'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Banner,Button,Empty,Explainer,Footer,Grid,Kpi,Kpis,Note,Panel,Pill,Rows,Row,Segmented,StateMessage} from '../../ui/kit';
import {defaultSelection,kindLabels,cohortLabels,presenceLabels,usageDate,usageIsStale,type UsageSummary,type UsageUsers,type UserSelection} from '@/lib/support-usage';
import k from '../../ui/kit.module.css';
import s from './gebruikers.module.css';
import DailyCharts from './daily-charts';
type Result<T>={data?:T;error?:string};
type Request={filter:UserSelection;page:number};
export default function Overview({token,isCurrentToken}:{token:string;isCurrentToken:(token:string)=>boolean}){
 const [days,setDays]=useState<7|30|90>(30);
 const [refresh,setRefresh]=useState(0);
 const [now,setNow]=useState(0);
 const [summary,setSummary]=useState<Result<UsageSummary>>({});
 const [selection,setSelection]=useState<UserSelection>({...defaultSelection});
 const [request,setRequest]=useState<Request|null>(null);
 const [list,setList]=useState<{request:Request;result:Result<UsageUsers>}|null>(null);
 useEffect(()=>{
  const tick=()=>{setNow(Date.now());if(document.visibilityState==='visible')setRefresh(n=>n+1);};
  const timer=setInterval(tick,30_000);
  const visible=()=>{if(document.visibilityState==='visible')tick();};
  document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{
  if(document.visibilityState!=='visible')return;
  const controller=new AbortController();
  void fetch(`/api/support/gebruikers?days=${days}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
  .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error??'Laden mislukt.');return body as UsageSummary;})
  .then(data=>{if(!controller.signal.aborted&&isCurrentToken(token)){setSummary({data});setNow(Date.now());}})
  .catch(error=>{if(!controller.signal.aborted&&isCurrentToken(token))setSummary(previous=>({...previous,error:error instanceof Error?error.message:'Geen verbinding.'}));});
  return()=>controller.abort();
 },[token,isCurrentToken,days,refresh]);
 useEffect(()=>{
  if(!request||document.visibilityState!=='visible')return;
  const controller=new AbortController();
  void fetch('/api/support/gebruikers',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store',signal:controller.signal})
  .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error??'Laden mislukt.');return body as UsageUsers;})
  .then(data=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,result:{data}});})
  .catch(error=>{if(!controller.signal.aborted&&isCurrentToken(token))setList({request,result:{error:error instanceof Error?error.message:'Geen verbinding.'}});});
  return()=>controller.abort();
 },[request,token,isCurrentToken,refresh]);
 const data=summary.data;
 const current=list?.request===request?list.result:null;
 const stale=!!summary.error||!!data&&usageIsStale(data.captured_at,now);
 function open(patch:Partial<UserSelection>){
  const filter={...defaultSelection,...patch};setSelection(filter);setList(null);setRequest({filter,page:0});
  document.getElementById('people')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 return <>
 <div className={s.tools}><Segmented label="Periode" options={[7,30,90] as const} value={days} onChange={setDays} format={v=>`${v} dagen`}/><Button onClick={()=>setRefresh(n=>n+1)}>Vernieuwen</Button></div>
 {!data?<StateMessage error={summary.error} onRetry={()=>setRefresh(n=>n+1)}>Gebruikersoverzicht laden…</StateMessage>:<>
 {stale&&<Banner tone="warn" role="alert">{summary.error??'De gegevens zijn verouderd.'} De getoonde online-status is niet actueel. Laatste geslaagde meting: {usageDate(data.captured_at)}.</Banner>}
 <Kpis><Kpi label="Leerlingaccounts" value={data.totals.learners} note={<Button onClick={()=>open({kind:'learner'})}>Leerlingen bekijken</Button>}/>
 <Kpi label="Met actieve rijschool" value={data.totals.with_school} note={<Button onClick={()=>open({cohort:'with_school'})}>Bekijken</Button>}/>
 <Kpi label="Zonder actieve rijschool" value={data.totals.without_school} note={<Button onClick={()=>open({cohort:'without_school'})}>Bekijken</Button>}/>
 <Kpi label={stale?'Eerder online gemeten':'Nu online · alle rollen'} value={stale?'—':data.totals.online} tone={stale?'warn':'ok'} note={<Button disabled={stale} onClick={()=>open({kind:'all',presence:'online'})}>Wie zijn online?</Button>}/></Kpis>
 <Note>Zonder actieve rijschool: {data.totals.no_link} zonder koppeling · {data.totals.waitlist} op de wachtlijst · {data.totals.other_school_states} geslaagd, gestopt of geschorst. {data.totals.unknown} gebruikers hebben nog geen aanwezigheidsmeting.</Note>
 <Grid><Panel id="online" title="Nu in Ribba" note={stale?'Laatste meting; momenteel niet actueel.':'Unieke gebruikers, ook als iemand meerdere appsessies heeft.'}>
 <Rows>{data.online_by_kind.map(row=><Row key={`${row.kind}-${row.cohort}`} title={kindLabels[row.kind]} sub={row.kind==='learner'?cohortLabels[row.cohort]:undefined} end={<Button disabled={stale} onClick={()=>open({kind:row.kind,cohort:row.kind==='learner'?row.cohort:'all',presence:'online'})}>{row.users} bekijken</Button>}/>)}</Rows>
 {!data.online_by_kind.length&&<Empty>{stale?'Geen actuele meting beschikbaar.':'Niemand online gemeten.'}</Empty>}
 <Note>Online: app op de voorgrond, binnen 90 seconden bevestigd. Bij verbindingsverlies kan de status tot 90 seconden achterlopen.</Note>
 </Panel><Panel id="versions" title="Appversies" note="Laatst gemelde versie per gebruiker. Rijschoolgebruikers en leerlingen apart; geen meting = onbekend.">
 <details><summary>Appversies per rol en toestel bekijken</summary><Rows>{data.versions.map((v,i)=><Row key={i} title={`${v.app_version??'Onbekende appversie'} · ${v.platform??'platform onbekend'}`} sub={`${kindLabels[v.kind]} · OTA ${v.ota_id??'onbekend'}`} meta={`${v.users} gebruikers`}/>)}</Rows>
 {!data.versions.length&&<Empty>Nog geen gebruikers beschikbaar.</Empty>}</details>
 </Panel></Grid>
 <Panel id="daily" title="Groei en dagelijks gebruik" note="Bekijk de ontwikkeling en kies een dag voor de bijbehorende personen.">
 <DailyCharts days={data.days} onOpen={open}/>
 <details className={s.dayDetails}><summary>Bekijk dagcijfers</summary>
 <div className={s.scroll}><table className={s.table}><caption>Leerlingen: nieuw bij registratie en actief bij eerste dagmeting</caption><thead><tr><th scope="col">Dag</th><th scope="col">Nieuw met school</th><th scope="col">Nieuw zonder school</th><th scope="col">Nieuw · indeling onbekend</th><th scope="col">Actief met school</th><th scope="col">Actief zonder school</th><th scope="col">Nieuwe rijschoolgebruikers</th><th scope="col">Actieve rijschoolgebruikers</th></tr></thead><tbody>{data.days.map(d=><tr key={d.day}><th scope="row">{d.day}</th>
 {(['new_with_school','new_without_school','new_unknown','active_with_school','active_without_school','new_school_users','active_school_users'] as const).map((field,i)=>{
 const metric=field.startsWith('new')?'new':'active';const kind=field.endsWith('school_users')?'school':'learner';
 const cohort=field==='new_unknown'?'unknown':field.includes('without_school')?'without_school':field.endsWith('school_users')?'all':'with_school';
 return <td key={field}>{metric==='active'&&!d.measured?<span title="Meting nog niet gestart">—</span>:<Button aria-label={`${d.day}: ${d[field]} ${['nieuwe leerlingen met school','nieuwe leerlingen zonder school','nieuwe leerlingen met onbekende schoolindeling','actieve leerlingen met school','actieve leerlingen zonder school','nieuwe rijschoolgebruikers','actieve rijschoolgebruikers'][i]} bekijken`} onClick={()=>open({day:d.day,metric,kind,cohort})}>{d[field]}</Button>}</td>;
 })}</tr>)}</tbody></table></div></details>
 <Note>Schoolindeling bij nieuwe leerlingen wordt vastgelegd bij eerste herkenning als leerling. Bij actief gebruik geldt de eerste meting van die dag. Historische indelingen worden niet achteraf ingevuld. De eerste meetdag is gedeeltelijk; ook oudere appversies kunnen ontbreken in de actieve cijfers.</Note>
 </Panel>
 <Panel id="schools" title="Per rijschool" note="Actief gekoppelde leerlingen, uniek binnen iedere school. Een leerling bij twee scholen telt in het totaal één keer.">
 <div className={s.scroll}><table className={s.table}><thead><tr><th scope="col">Rijschool</th><th scope="col">Leerlingen</th><th scope="col">Leerlingen online</th><th scope="col">Rijschoolgebruikers online</th></tr></thead><tbody>{data.schools.map(school=><tr key={school.id}><th scope="row"><Link href={`/support/${school.id}`}>{school.name}</Link></th><td><Button onClick={()=>open({school_id:school.id,cohort:'with_school'})}>{school.learners}</Button></td><td><Button disabled={stale} onClick={()=>open({school_id:school.id,presence:'online'})}>{stale?'—':school.online_learners}</Button></td><td><Button disabled={stale} onClick={()=>open({kind:'school',school_id:school.id,presence:'online'})}>{stale?'—':school.online_school_users}</Button></td></tr>)}</tbody></table></div>
 </Panel>
 <Panel id="people" title="Personen bekijken" note="Namen en e-mailadressen worden pas na openen opgehaald. Elke inzage wordt automatisch vastgelegd.">
 <form className={s.filters} onSubmit={event=>{event.preventDefault();setList(null);setRequest({filter:{...selection,query:selection.query.trim()},page:0});}}>
 <label className={k.field}>Gebruikers<select value={selection.kind} onChange={e=>setSelection({...selection,kind:e.target.value as UserSelection['kind']})}><option value="all">Alle rollen</option>{Object.entries(kindLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <label className={k.field}>Schoolindeling<select value={selection.cohort} onChange={e=>setSelection({...selection,cohort:e.target.value as UserSelection['cohort']})}><option value="all">Alle indelingen</option>{Object.entries(cohortLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <label className={k.field}>Aanwezigheid<select value={selection.presence} onChange={e=>setSelection({...selection,presence:e.target.value as UserSelection['presence']})}><option value="all">Alle statussen</option>{Object.entries(presenceLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <label className={k.field}>Rijschool<select value={selection.school_id} onChange={e=>setSelection({...selection,school_id:e.target.value})}><option value="">Alle rijscholen</option>{data.schools.map(school=><option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
 <label className={k.field}>Selectie<select value={selection.metric} onChange={e=>setSelection({...selection,metric:e.target.value as UserSelection['metric']})}><option value="current">Huidige gebruikers</option><option value="new">Nieuw op een dag</option><option value="active">Actief op een dag</option></select></label>
 {selection.metric!=='current'&&<label className={k.field}>Dag<input required type="date" value={selection.day} max={data.days[0]?.day} min={data.days[data.days.length-1]?.day} onChange={e=>setSelection({...selection,day:e.target.value})}/></label>}
 <label className={k.field}>Naam of e-mailadres<input maxLength={100} autoComplete="off" value={selection.query} onChange={e=>setSelection({...selection,query:e.target.value})}/></label>
 <Button primary type="submit">Personen bekijken</Button>
 </form>
 {request&&<><div className={s.tools}><Note>{request.filter.metric==='current'?'Huidige schoolindeling':`${request.filter.metric==='new'?'Nieuw':'Actief'} op ${request.filter.day} · historische schoolindeling`}{request.filter.cohort!=='all'?` · ${cohortLabels[request.filter.cohort]}`:''}</Note><Button onClick={()=>{setRequest(null);setList(null);}}>Personen sluiten</Button></div>
 {!current?<p role="status">Personen laden…</p>:current.error?<StateMessage error={current.error} onRetry={()=>setRequest({...request})}/>:current.data&&<>
 <Note>{current.data.total} gebruikers · bijgewerkt {usageDate(current.data.captured_at)}</Note>
 {!current.data.rows.length?<Empty>Geen gebruikers gevonden met deze filters.</Empty>:<div className={s.people}>{current.data.rows.map(person=><article className={s.person} key={person.user_id}>
 <header><div><h3>{person.kind==='learner'?<Link href={`/support/dashboard/learners/${person.user_id}`}>{person.name??person.email??'Naam onbekend'}</Link>:person.name??person.email??'Naam onbekend'}</h3><p>{person.name?person.email:null} · {kindLabels[person.kind]}</p></div><Pill tone={person.presence==='online'?'ok':'neutral'}>{usageIsStale(current.data!.captured_at,now)?'Status verouderd':presenceLabels[person.presence]}</Pill></header>
 <p>Account aangemaakt: {usageDate(person.registered_at)} · Laatst gemeten appgebruik: {usageDate(person.last_seen_at)}</p>
 <p>Huidige schoolstatus: {({active:'actief',none:'geen schoolkoppeling',waitlist:'wachtlijst',graduated:'geslaagd',inactive:'gestopt / geschorst'} as Record<string,string>)[person.school_state]??person.school_state}.</p>
 <p>{person.schools.length?person.schools.map((school,i)=><span key={`${school.id}-${i}`}><Link href={`/support/${school.id}`}>{school.name}</Link> ({school.status}){i<person.schools.length-1?' · ':''}</span>):'Geen huidige schoolkoppeling'}</p>
 <p>App {person.app_version??'onbekend'} · {person.platform??'platform onbekend'} · OTA {person.ota_id??'onbekend'}</p>
 {person.sessions.length>0&&<details><summary>{person.sessions.length} gemeten appsessie(s)</summary><Rows>{person.sessions.map(session=><Row key={session.session_id} title={`App ${session.app_version} · ${session.platform}`} sub={`OTA ${session.ota_id} · ${usageDate(session.seen_at)}`} meta={usageIsStale(current.data!.captured_at,now)?'Status verouderd':session.online?'Online':'Niet online gemeten'}/>)}</Rows><Note>Appsessies kunnen van hetzelfde apparaat zijn. Dit is geen inventaris van fysieke toestellen.</Note></details>}
 </article>)}</div>}
 <div className={s.tools}><Button disabled={current.data.page===0} onClick={()=>{setList(null);setRequest({...request,page:request.page-1});}}>Vorige</Button><span>Pagina {current.data.page+1} van {Math.max(1,Math.ceil(current.data.total/current.data.page_size))}</span><Button disabled={(current.data.page+1)*current.data.page_size>=current.data.total} onClick={()=>{setList(null);setRequest({...request,page:request.page+1});}}>Volgende</Button></div>
 </>}
 </>}
 </Panel>
 <Explainer><p>Actief betekent dat de app op de voorgrond is bevestigd, ook als iemand alleen leest. Een login of activatielink telt hier niet als appgebruik. Actieve cijfers starten op {usageDate(data.measured_since)}; ontbrekende metingen bewijzen geen inactiviteit.</p><p>Nieuwe accounts zijn geen downloads. Verwijderde accounts verdwijnen ook uit de historische cijfers. Bekende testaccounts, platformmedewerkers en uitsluitend interne scholen zijn uitgesloten volgens het bestaande leerlingcontract. Nog onbekende tests kunnen meetellen.</p><p>Een schoolkoppeling die later verandert, verandert de opgeslagen dagindeling niet. De personenlijst toont daarnaast de huidige schoolrelaties. Appversies zijn laatst gemelde versies, geen bewijs dat een update geïnstalleerd is op alle toestellen.</p><p>Gegevens worden iedere 30 seconden ververst zolang deze pagina zichtbaar is. Zonder actuele meting is de online-status onbekend of verouderd.</p></Explainer>
 <Footer>Bijgewerkt: {usageDate(data.captured_at)} · Meting gestart: {usageDate(data.measured_since)} · Alle tijden Europe/Amsterdam.</Footer>
 </>}
 </>;
}
