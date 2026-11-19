'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useSupportNavigationGuard,useSupportNavigationConfirm} from '../../support-shell';
import {assistance,blockers,eventLabels,resolutions,sourceLabels,topics,type CaseInput,type JourneyData,type SupportCase,type WorkflowSummary} from '@/lib/owner-journey';
import {Banner,Button,Empty,Explainer,Footer,Funnel,Grid,Kpi,Kpis,Note,Page,PageHeader,Panel,Pill,Row,Rows,StateMessage,kit} from '../../ui/kit';
import styles from './journey.module.css';
const format=(s:string)=>new Date(s).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'});
const initial:CaseInput={version:1,topic:'packages',blocker:'how_to',assistance:'explanation',resolution:'pending',status:'open',minutes:5,follow_up:null};
export default function JourneyView({token,school,onSchool,unauthorized,error,data,notice,onRetry,onSave}:{token:string|null;school:string;onSchool:(id:string)=>void;unauthorized:boolean;error?:string;data?:JourneyData;notice:string|null;onRetry:()=>void;onSave:(id:string,revision:number,input:CaseInput)=>Promise<void>}){
 const confirmLeave=useSupportNavigationConfirm();
 const onvolledig=!!data&&(!data.quality.enabled||data.quality.triggers_active!==7||data.quality.failures_30d>0);
 return <Page>
  <PageHeader eyebrow="Ribba · beheer" title="Klantreis en support." subtitle="Zie wat er gebeurt, leg je hulp vast en volg openstaande vragen op."
   actions={data&&<>
    <label className={kit.inlineField}>Rijschool<select value={school} onChange={e=>{if(confirmLeave())onSchool(e.target.value);}}><option value="">Alle rijscholen · overzicht</option>{data.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {school&&<Link href={`/support/${school}`}>Rijschool openen ↗</Link>}
   </>}/>
  {unauthorized?<p><Link href="/support">Log opnieuw in met tweefactor.</Link></p>:error?<StateMessage error={error} onRetry={onRetry}/>:!data?<StateMessage>Klantreis laden…</StateMessage>:<>
   <Conclusion data={data} onvolledig={onvolledig}/>
   {notice&&<Banner tone="ok" role="status">{notice}</Banner>}
   <Kpis columns={3}>
    <Kpi label="Openstaande hulpvragen" value={data.support_summary.open} note="Nog niet afgerond"/>
    <Kpi label="Vandaag of eerder opvolgen" value={data.support_summary.due} tone={data.support_summary.due>0?'warn':undefined} note="Opvolgdatum is vandaag of verstreken"/>
    <Kpi label="Hulptijd · 30 dagen" value={`${data.support_summary.minutes_30d} min`} note="Hulpvragen gestart in 30 dagen"/>
   </Kpis>
   <Grid>
    <Panel id="metingen" title="Wat weten we al?" note={`Metingen vanaf ${format(data.quality.started_at)}. Alleen waargenomen databasehandelingen.`}>
     {onvolledig&&<Banner tone="warn" role="alert">De metingen zijn onvolledig: {!data.quality.enabled?'meten staat uit. ':''}{data.quality.triggers_active!==7?'Niet alle meetpunten zijn actief. ':''}{data.quality.failures_30d>0?`${data.quality.failures_30d} meetfouten in 30 dagen.`:''}</Banner>}
     {(!data.quality.maintained_at||Date.parse(data.captured_at)-Date.parse(data.quality.maintained_at)>30*3600000)&&<Banner tone="warn">Het periodieke onderhoud is nog niet bevestigd of loopt achter.</Banner>}
     <Funnel max={Math.max(1,data.summary.events)} steps={[
      {label:'Via klantaccounts',value:data.summary.customer,tone:'ok'},
      {label:'Via support',value:data.summary.support},
      {label:'Via import',value:data.summary.import},
      {label:'Herkomst onbekend',value:data.summary.unknown},
     ]}/>
     <Note>{data.summary.events} gebeurtenissen in 30 dagen. Eerdere stappen kunnen al afgerond zijn.</Note>
     <Explainer title="Betekenis en ontbrekende metingen"><p>Een klantaccount bewijst niet dat iemand zonder hulp werkte. Een lesrecord is geen gegeven les. Een pakketrecord bewijst nog niet dat alle pakketregels zijn opgeslagen. Uitnodigingen omvatten verschillende rollen; dit is geen volledige leerlingactivatiefunnel.</p><p>De databasewaarnemingen tonen geen formulierstarts of invoerproblemen. Aanvullende appmeldingen voor de wizard en pakketaanmaak staan hiernaast; andere processen en offline wachttijd zijn nog niet gedekt. Geen gebeurtenis betekent dus niet dat een klant vastloopt. Gebeurtenissen blijven 400 dagen bewaard. Open hulpvragen blijven staan; afgeronde vragen vervallen 400 dagen na de laatste wijziging. Bij verwijdering van een school verdwijnen de gekoppelde gegevens.</p></Explainer>
    </Panel>
    <WorkflowPanel data={data.workflows} capturedAt={data.captured_at}/>
   </Grid>
   {school&&<Panel id="vastleggen" title="Hulpvraag vastleggen" note="Korte registratie van bijvoorbeeld een WhatsApp-gesprek. Gebruik de categorieën; er wordt geen gespreksinhoud opgeslagen."><CaseForm key={`${token}:${school}`} onSave={onSave}/></Panel>}
   <Panel id="registraties" title={school?'Supportregistraties':'Openstaande hulpvragen'} note="Maximaal 100 registraties. Open vragen en eerstvolgende afspraken staan bovenaan.">
    {data.cases.length===0?<Empty>Geen supportregistraties in dit overzicht.</Empty>:<ul className={styles.cases}>{data.cases.map(c=><li className={styles.case} key={c.id}>
     <div className={styles.caseHead}><strong>{topics[c.topic]}</strong><Pill tone={c.status==='open'?'warn':'ok'}>{c.status==='open'?'Open':'Afgerond'}</Pill></div>
     <p>{c.school_name} · {format(c.created_at)}</p>
     <p>{blockers[c.blocker]} · {assistance[c.assistance]} · {c.minutes} minuten</p>
     <p>{resolutions[c.resolution]}{c.follow_up?` · Opvolgen: ${new Date(c.follow_up+'T12:00:00Z').toLocaleDateString('nl-NL')}`:''}</p>
     {school?<details className={styles.edit}><summary>Aanpassen of afronden</summary><CaseForm key={`${token}:${c.id}:${c.revision}`} existing={c} onSave={onSave}/></details>:<Button onClick={()=>{if(confirmLeave())onSchool(c.school_id);}}>Klantreis openen</Button>}
    </li>)}</ul>}
   </Panel>
   {school&&<Panel id="gebeurtenissen" title="Gebeurtenissen" note="Laatste 100 waarnemingen, nieuwste bovenaan. Geen historische aanvulling.">{data.events.length===0?<Empty>Nog geen gebeurtenissen sinds de meetstart.</Empty>:<ol className={kit.timeline}>{data.events.map(e=><li key={e.id}><time dateTime={e.occurred_at}>{format(e.occurred_at)}</time><div><strong>{eventLabels[e.event_name]??'Gebeurtenis'}</strong><br/><small>{sourceLabels[e.source]??'Herkomst onbekend'}</small></div></li>)}</ol>}</Panel>}
   <Footer>Bijgewerkt: {format(data.captured_at)}, Nederlandse tijd.</Footer>
  </>}
 </Page>;
}
/** De conclusie bovenaan: eerst of de metingen kloppen, dan wat er opgevolgd moet worden. */
function Conclusion({data,onvolledig}:{data:JourneyData;onvolledig:boolean}){
 const {open,due}=data.support_summary;
 if(onvolledig)return <Banner tone="warn">De metingen zijn onvolledig; lees de cijfers hieronder met voorbehoud.</Banner>;
 if(due>0)return <Banner tone="warn">{due===1?'1 hulpvraag moet':`${due} hulpvragen moeten`} vandaag of eerder worden opgevolgd.</Banner>;
 if(open>0)return <Banner tone="info">{open===1?'1 hulpvraag staat':`${open} hulpvragen staan`} open. Niets is achterstallig.</Banner>;
 return <Banner tone="ok">Geen openstaande hulpvragen.</Banner>;
}
function CaseForm({existing,onSave}:{existing?:SupportCase;onSave:(id:string,revision:number,input:CaseInput)=>Promise<void>}){
 const [input,setInput]=useState<CaseInput>(existing?{version:1,topic:existing.topic,blocker:existing.blocker,assistance:existing.assistance,resolution:existing.resolution,status:existing.status,minutes:existing.minutes,follow_up:existing.follow_up}:initial);
 const baseline=existing?{version:1,topic:existing.topic,blocker:existing.blocker,assistance:existing.assistance,resolution:existing.resolution,status:existing.status,minutes:existing.minutes,follow_up:existing.follow_up}:initial;
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useSupportNavigationGuard(busy||JSON.stringify(input)!==JSON.stringify(baseline));
 const id=useRef<string|null>(existing?.id??null);
 const inFlight=useRef(false);
 return <form className={kit.form} onSubmit={async e=>{e.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');id.current??=crypto.randomUUID();try{await onSave(id.current,existing?.revision??0,input);if(!existing){id.current=null;setInput(initial);}}catch(err){setError(err instanceof Error?err.message:'Geen verbinding. Probeer opnieuw.');}finally{inFlight.current=false;setBusy(false);}}}>
  <fieldset disabled={busy}>
   <label className={kit.field}>Onderwerp<select value={input.topic} onChange={e=>setInput({...input,topic:e.target.value as CaseInput['topic']})}>{Object.entries(topics).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className={kit.field}>Wat hield de klant tegen?<select value={input.blocker} onChange={e=>setInput({...input,blocker:e.target.value as CaseInput['blocker']})}>{Object.entries(blockers).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className={kit.field}>Hoe heb je geholpen?<select value={input.assistance} onChange={e=>setInput({...input,assistance:e.target.value as CaseInput['assistance']})}>{Object.entries(assistance).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className={kit.field}>Uitkomst<select value={input.resolution} onChange={e=>setInput({...input,resolution:e.target.value as CaseInput['resolution'],status:e.target.value==='pending'?'open':'resolved'})}>{Object.entries(resolutions).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className={kit.field}>Totale tijd voor deze hulpvraag (minuten)<input type="number" min="0" max="480" step="1" required value={input.minutes} onChange={e=>setInput({...input,minutes:e.target.valueAsNumber})}/></label>
   <label className={kit.field}>Opvolgen op (optioneel)<input type="date" value={input.follow_up??''} onChange={e=>setInput({...input,follow_up:e.target.value||null})}/></label>
  </fieldset>
  <div className={kit.formEnd}><Button primary disabled={busy} type="submit">{busy?'Opslaan…':existing?'Wijzigingen opslaan':'Hulpvraag opslaan'}</Button>{error&&<span role="alert" className={kit.text_bad}>{error}</span>}</div>
 </form>;
}

const workflowLabels={wizard:'Rijschool instellen',package_create:'Pakket aanmaken'};
const stepLabels:Record<string,string>={bedrijf:'Bedrijfsgegevens',lesduur:'Lesduur',opleiding:'Opleiding',planning:'Planningsmodus',afsluiten:'Wizard afsluiten',pakket:'Pakket opslaan'};
function WorkflowPanel({data,capturedAt}:{data?:WorkflowSummary|{status:'unavailable'};capturedAt:string}){
 if(!data||data.status!=='ready')return <Panel id="vastlopen" title="Waar lopen klanten vast?"><Empty>Deze aanvullende metingen zijn nog niet beschikbaar. Het overige supportoverzicht blijft bruikbaar.</Empty></Panel>;
 return <Panel id="vastlopen" title="Waar lopen klanten vast?" note={`Appmeldingen vanaf ${format(data.quality.started_at)}. Schermbezoeken gestart in de laatste 30 dagen.`}>
 {!data.quality.enabled&&<Banner tone="warn">Deze metingen staan uit. De getallen hieronder zijn eerder ontvangen meldingen.</Banner>}
 {(!data.quality.maintained_at||Date.parse(capturedAt)-Date.parse(data.quality.maintained_at)>30*3600000)&&<Banner tone="warn">Onderhoud van deze metingen is nog niet bevestigd of loopt achter.</Banner>}
 {data.quality.runs_without_opening>0&&<Banner tone="warn">{data.quality.runs_without_opening} bezoeken missen hun startmelding en tellen daarom niet mee in dit overzicht.</Banner>}
 {data.quality.days_at_limit>0&&<Banner tone="warn">De meetlimiet is op {data.quality.days_at_limit} rijschooldagen bereikt. Meldingen kunnen ontbreken.</Banner>}
 {data.workflows.length===0?<Empty>Nog geen gemeten schermbezoeken. Oudere appversies sturen deze meldingen niet; dit betekent niet dat er geen gebruik is.</Empty>:data.workflows.map(w=><div className={styles.workflow} key={w.workflow}>
 <h3>{workflowLabels[w.workflow]}</h3>
 <Funnel max={Math.max(1,w.runs)} steps={[
  {label:`Schermbezoeken · ${w.schools} ${w.schools===1?'rijschool':'rijscholen'}`,value:w.runs},
  {label:'Afgerond',value:w.completed,tone:'ok'},
  {label:'Bewust overgeslagen',value:w.skipped},
  {label:'Zonder ontvangen afronding',value:w.unconfirmed},
 ]}/>
 <Note>{w.attempts} verzendpogingen · {w.blocked} invoerblokkades · {w.failed} {w.failed===1?'opslagpoging':'opslagpogingen'} zonder bevestiging.{w.support_runs>0?` ${w.support_runs} bezoeken via supportaccounts.`:''}</Note>
 <Rows>{data.steps.filter(s=>s.workflow===w.workflow&&s.attempts>0).map(s=><Row key={s.step} title={stepLabels[s.step]??'Stap'} meta={`${s.attempts} pogingen`} end={s.blocked+s.failed>0?<Pill tone="warn">{s.blocked} geblokkeerd · {s.failed} niet bevestigd</Pill>:<Pill tone="ok">Geen problemen</Pill>}/>)}</Rows>
 </div>)}
 <Explainer title="Hoe lees je deze metingen?"><p>Een schermbezoek kan meerdere pogingen bevatten. Een ontbrekende afronding bewijst geen afhaken: iemand kan later verdergaan of een melding kan verloren zijn gegaan. Appmeldingen zijn geen onafhankelijk bewijs van databaseopslag. Een afgeronde wizard betekent niet dat alle rijschoolinstellingen compleet zijn.</p><p>Alleen wizard en pakketaanmaak worden gemeten, vanaf een appversie met deze meetpunten. Geen formulierinhoud of fouttekst; maximaal 128 meldingen per bezoek en 2.000 per rijschool per UTC-dag. Geen offline herverzending. Bewaartermijn: 90 dagen.</p>
 {data.versions.length>0&&<p>Ontvangen van: {data.versions.map(v=>`${v.platform} ${v.app_version} (${v.schools} rijscholen)`).join(' · ')}. Dit bewijst niet welk deel van alle apparaten meet.</p>}</Explainer>
 </Panel>;
}
