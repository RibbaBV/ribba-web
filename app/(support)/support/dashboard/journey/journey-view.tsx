'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {assistance,blockers,eventLabels,resolutions,sourceLabels,topics,type CaseInput,type JourneyData,type SupportCase} from '@/lib/owner-journey';
import styles from './journey.module.css';
const format=(s:string)=>new Date(s).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'});
const initial:CaseInput={version:1,topic:'packages',blocker:'how_to',assistance:'explanation',resolution:'pending',status:'open',minutes:5,follow_up:null};
export default function JourneyView({token,school,onSchool,unauthorized,error,data,notice,onRetry,onSave}:{token:string|null;school:string;onSchool:(id:string)=>void;unauthorized:boolean;error?:string;data?:JourneyData;notice:string|null;onRetry:()=>void;onSave:(id:string,revision:number,input:CaseInput)=>Promise<void>}){
 return <main className={styles.page}>
  <nav><Link href="/support/dashboard">← Dashboard</Link><span>Alleen eigenaar</span></nav>
  <header><h1>Klantreis en support</h1><p>Zie wat er gebeurt, leg je hulp vast en volg openstaande vragen op.</p></header>
  {unauthorized?<p><Link href="/support">Log opnieuw in met tweefactor.</Link></p>:error?<div role="alert"><p>{error}</p><button onClick={()=>onRetry()}>Opnieuw proberen</button></div>:!data?<p role="status">Klantreis laden…</p>:<>
   <label className={styles.selector}>Rijschool<select value={school} onChange={e=>{onSchool(e.target.value);}}><option value="">Alle rijscholen · overzicht</option>{data.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   {school&&<Link href={`/support/${school}`}>Rijschool openen ↗</Link>}
   <div className={styles.metrics}><article><strong>{data.support_summary.open}</strong><span>Openstaande hulpvragen</span></article><article><strong>{data.support_summary.due}</strong><span>Vandaag of eerder opvolgen</span></article><article><strong>{data.support_summary.minutes_30d} min</strong><span>Hulpvragen gestart in 30 dagen</span></article></div>
   <section className={styles.card}><h2>Wat weten we al?</h2><p>Metingen vanaf {format(data.quality.started_at)}. Alleen waargenomen databasehandelingen; eerdere stappen kunnen al afgerond zijn.</p>
    {(!data.quality.enabled||data.quality.triggers_active!==7||data.quality.failures_30d>0)&&<p className={styles.warning} role="alert">De metingen zijn onvolledig: {!data.quality.enabled?'meten staat uit. ':''}{data.quality.triggers_active!==7?'Niet alle meetpunten zijn actief. ':''}{data.quality.failures_30d>0?`${data.quality.failures_30d} meetfouten in 30 dagen.`:''}</p>}
    {(!data.quality.maintained_at||Date.parse(data.captured_at)-Date.parse(data.quality.maintained_at)>30*3600000)&&<p className={styles.warning}>Het periodieke onderhoud is nog niet bevestigd of loopt achter.</p>}
    <p>{data.summary.events} gebeurtenissen in 30 dagen: {data.summary.customer} via klantaccounts, {data.summary.support} via support, {data.summary.import} via import en {data.summary.unknown} met onbekende herkomst.</p>
    <details><summary>Betekenis en ontbrekende metingen</summary><p>Een klantaccount bewijst niet dat iemand zonder hulp werkte. Een lesrecord is geen gegeven les. Een pakketrecord bewijst nog niet dat alle pakketregels zijn opgeslagen. Uitnodigingen omvatten verschillende rollen; dit is geen volledige leerlingactivatiefunnel.</p><p>Starts, afgebroken formulieren, foutmeldingen, offline wachttijd en appversies worden in deze eerste versie nog niet gemeten. Geen gebeurtenis betekent dus niet dat een klant vastloopt. Gebeurtenissen blijven 400 dagen bewaard. Open hulpvragen blijven staan; afgeronde vragen vervallen 400 dagen na de laatste wijziging. Bij verwijdering van een school verdwijnen de gekoppelde gegevens.</p></details>
   </section>
   {notice&&<p role="status">{notice}</p>}
   {school&&<section className={styles.card}><h2>Hulpvraag vastleggen</h2><p>Korte registratie van bijvoorbeeld een WhatsApp-gesprek. Gebruik de categorieën; er wordt geen gespreksinhoud opgeslagen.</p><CaseForm key={`${token}:${school}`} onSave={onSave}/></section>}
   <section className={styles.card}><h2>{school?'Supportregistraties':'Openstaande hulpvragen'}</h2><p>Maximaal 100 registraties. Open vragen en eerstvolgende afspraken staan bovenaan.</p>
    {data.cases.length===0?<p>Geen supportregistraties in dit overzicht.</p>:data.cases.map(c=><article className={styles.case} key={c.id}>
     <div><strong>{topics[c.topic]} · {c.status==='open'?'Open':'Afgerond'}</strong><p>{c.school_name} · {format(c.created_at)}</p><p>{blockers[c.blocker]} · {assistance[c.assistance]} · {c.minutes} minuten</p><p>{resolutions[c.resolution]}{c.follow_up?` · Opvolgen: ${new Date(c.follow_up+'T12:00:00Z').toLocaleDateString('nl-NL')}`:''}</p></div>
     {school?<details><summary>Aanpassen of afronden</summary><CaseForm key={`${token}:${c.id}:${c.revision}`} existing={c} onSave={onSave}/></details>:<button onClick={()=>onSchool(c.school_id)}>Klantreis openen</button>}
    </article>)}
   </section>
   {school&&<section className={styles.card}><h2>Gebeurtenissen</h2><p>Laatste 100 waarnemingen, nieuwste bovenaan. Geen historische aanvulling.</p>{data.events.length===0?<p>Nog geen gebeurtenissen sinds de meetstart.</p>:<ol className={styles.timeline}>{data.events.map(e=><li key={e.id}><strong>{eventLabels[e.event_name]??'Gebeurtenis'}</strong><span>{sourceLabels[e.source]??'Herkomst onbekend'} · {format(e.occurred_at)}</span></li>)}</ol>}</section>}
  </>}
 </main>;
}
function CaseForm({existing,onSave}:{existing?:SupportCase;onSave:(id:string,revision:number,input:CaseInput)=>Promise<void>}){
 const [input,setInput]=useState<CaseInput>(existing?{version:1,topic:existing.topic,blocker:existing.blocker,assistance:existing.assistance,resolution:existing.resolution,status:existing.status,minutes:existing.minutes,follow_up:existing.follow_up}:initial);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const id=useRef<string|null>(existing?.id??null);
 const inFlight=useRef(false);
 return <form className={styles.form} onSubmit={async e=>{e.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');id.current??=crypto.randomUUID();try{await onSave(id.current,existing?.revision??0,input);if(!existing){id.current=null;setInput(initial);}}catch(err){setError(err instanceof Error?err.message:'Geen verbinding. Probeer opnieuw.');}finally{inFlight.current=false;setBusy(false);}}}>
  <fieldset disabled={busy}>
   <label>Onderwerp<select value={input.topic} onChange={e=>setInput({...input,topic:e.target.value as CaseInput['topic']})}>{Object.entries(topics).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Wat hield de klant tegen?<select value={input.blocker} onChange={e=>setInput({...input,blocker:e.target.value as CaseInput['blocker']})}>{Object.entries(blockers).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Hoe heb je geholpen?<select value={input.assistance} onChange={e=>setInput({...input,assistance:e.target.value as CaseInput['assistance']})}>{Object.entries(assistance).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Uitkomst<select value={input.resolution} onChange={e=>setInput({...input,resolution:e.target.value as CaseInput['resolution'],status:e.target.value==='pending'?'open':'resolved'})}>{Object.entries(resolutions).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Totale tijd voor deze hulpvraag (minuten)<input type="number" min="0" max="480" step="1" required value={input.minutes} onChange={e=>setInput({...input,minutes:e.target.valueAsNumber})}/></label>
   <label>Opvolgen op (optioneel)<input type="date" value={input.follow_up??''} onChange={e=>setInput({...input,follow_up:e.target.value||null})}/></label>
  </fieldset>
  {error&&<p role="alert">{error}</p>}<button disabled={busy} type="submit">{busy?'Opslaan…':existing?'Wijzigingen opslaan':'Hulpvraag opslaan'}</button>
 </form>;
}
