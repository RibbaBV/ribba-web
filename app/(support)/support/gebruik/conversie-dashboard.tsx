'use client';
import { useEffect, useState } from 'react';
import { metricValue, linePaths, rollingRate, type ConversionReport, type DailyPoint, type Metric, type Segment } from '@/lib/conversion-metrics';
import type { Periode } from '@/lib/app-gebruik';
import common from '../support-design.module.css';
import styles from './conversies.module.css';

export default function ConversieDashboard({ token, isCurrentToken }: { token: string; isCurrentToken: (t: string) => boolean }) {
 const [days,setDays] = useState<Periode>(30), [segment,setSegment] = useState<Segment>('leerlingen'), [intern,setIntern] = useState(false), [revision,refresh] = useState(0);
 const [response,setResponse] = useState<{key:string;data?:ConversionReport;error?:string;denied?:boolean}|null>(null);
 const key = `${token}|${days}|${segment}|${intern}|${revision}`;
 useEffect(() => { const timer=setInterval(()=>refresh(n=>n+1),300_000);return()=>clearInterval(timer); },[]);
 useEffect(()=>{
  const controller = new AbortController();
  void fetch(`/api/support/gebruik/conversies?dagen=${days}&doelgroep=${segment}${intern?'&intern=1':''}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setResponse({key,...(res.ok?{data:body}:{error:res.status===403?'Het conversiedashboard is beschikbaar voor accounts met eigenaartoegang. Het bestaande gebruiksoverzicht staat hieronder.':body.error??'Conversies laden mislukt.',denied:res.status===403})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setResponse({key,error:'Geen verbinding. Probeer het opnieuw.'});});
  return()=>controller.abort();
 },[token,days,segment,intern,revision,key,isCurrentToken]);
 const visible=response?.key===key?response:null;
 return <>
  <div className={styles.toolbar}>
   <div className={common.segmented} role="group" aria-label="Doelgroep"><button aria-pressed={segment==='leerlingen'} onClick={()=>setSegment('leerlingen')}>Leerlingen</button><button aria-pressed={segment==='rijscholen'} onClick={()=>setSegment('rijscholen')}>Rijscholen</button></div>
   <div className={common.segmented} role="group" aria-label="Conversieperiode">{([7,30,90] as const).map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{n} dagen</button>)}</div>
   <label className={styles.internal}><input type="checkbox" checked={intern} onChange={e=>setIntern(e.target.checked)}/> Test- en pilotscholen</label>
   <button className={common.quietButton} onClick={()=>refresh(n=>n+1)}>Verversen</button>
  </div>
  {visible?.data?<ConversieOverzicht key={`${days}-${segment}-${intern}`} data={visible.data}/>:<div className={styles.notice} role="status"><p>{visible?.error??'Conversies en dagelijkse cohorten laden…'}</p>{visible?.error&&!visible.denied&&<button className={common.quietButton} onClick={()=>refresh(n=>n+1)}>Opnieuw proberen</button>}</div>}
 </>;
}
const shortDate=(date:string)=>new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const stateLabel=(m:Metric)=>m.evidence==='missing'?'Meetkoppeling nodig':m.evidence==='proxy'?'Gedragsproxy':'Gemeten';
function latestObservation(metric:Metric){
 if(metric.current!==null)return {value:metric.current,n:metric.numerator,d:metric.denominator,label:`${metric.sampleDays} volledige dagen`,provisional:false};
 const latest=[...metric.daily].reverse().find(p=>p.value!==null);
 return latest?{value:latest.value,n:latest.numerator??0,d:latest.denominator??0,label:`${shortDate(latest.day)} · ${latest.provisional?'voorlopig':'laatste cohort'}`,provisional:latest.provisional}:{value:null,n:0,d:0,label:metric.evidence==='missing'?'Bron ontbreekt':'Nog geen volledig meetbaar cohort',provisional:false};
}
/** Dezelfde view voor productie en lokale browsercontrole; de route bevat geen demo- of toegangs-bypass. */
export function ConversieOverzicht({data}:{data:ConversionReport}){
 const [selected,setSelected]=useState('activation');
 const metric=data.metrics.find(m=>m.id===selected)??data.metrics[0];
 const incomplete=Object.entries(data.quality.sourceStates).filter(([,s])=>s.status!=='ready');
 const actionable=data.metrics.filter(m=>m.evidence==='proxy'&&m.denominator>0&&m.current!==null).sort((a,b)=>(a.current??100)-(b.current??100))[0];
 return <>
  <div className={styles.context}><span>Daggrenzen: Europe/Amsterdam · vandaag is voorlopig</span><span>Bijgewerkt {new Date(data.capturedAt).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'short',timeStyle:'short'})} · automatisch iedere 5 min.</span></div>
  <div className={styles.northStar}><div><p className={styles.kicker}>EERST WAARDE. DAN GROEI.</p><h2>Van eerste interesse naar terugkerend gebruik.</h2><p>Volg de zes PIRAAT-fasen en zoom in op de stap waar de meeste gebruikers blijven hangen. Leerlingen en rijscholen hebben ieder hun eigen meetdefinitie. Referral en omzet volgen het rijschoolmodel platformbreed; de fasen vormen geen doorlopende trechter met één noemer.</p></div><div className={styles.northNumber}><strong>{data.northStar.users ?? '—'}<span> / {data.northStar.active ?? '—'}</span></strong><span>{data.northStar.label}</span><small>Gekozen periode, inclusief vandaag. Geen bewezen afgerond leer- of boekingsresultaat.</small></div></div>
  <div className={styles.stages} aria-label="PIRAAT-fasen">{data.stages.map((stage,i)=>{const m=data.metrics.find(m=>m.id===stage.metricId)!;const observed=latestObservation(m);return <button key={stage.id} className={styles.stage} aria-pressed={selected===stage.metricId} onClick={()=>setSelected(stage.metricId)}>
   <span className={styles.stageIndex}>0{i+1} / {stage.title}</span><span className={styles.stageQuestion}>{stage.question}</span><strong>{metricValue(observed.value,m.unit)}</strong><span className={styles.metricName}>{m.title}</span><small>{observed.label}{m.unit==='percent'&&observed.d>0?` · ${observed.n}/${observed.d}`:''}</small><span className={m.evidence==='measured'?styles.measured:styles.proxy}>{stateLabel(m)}</span>
  </button>})}</div>
  <section className={styles.chartPanel} aria-labelledby="conversie-trend-title"><div className={styles.chartHeader}><div><p className={styles.kicker}>DAGELIJKSE ONTWIKKELING</p><h2 id="conversie-trend-title">Wordt de conversie beter?</h2></div><label className={styles.selectLabel}>Conversiedoel<select value={metric.id} onChange={e=>setSelected(e.target.value)}>{data.metrics.map(m=><option key={m.id} value={m.id}>{m.stage} · {m.title}</option>)}</select></label></div>
   <div className={styles.metricIntro}><h3>{metric.title}</h3><span className={metric.evidence==='measured'?styles.measured:styles.proxy}>{stateLabel(metric)}</span><p>{metric.definition}</p>{['referral','revenue','payment_receipts'].includes(metric.id)&&<p>Scope: platformbreed, rijschoolaanmeldingen en abonnementen. Niet toegeschreven aan de geselecteerde leerlingcohorten.</p>}</div>
   <Trend key={metric.id} metric={metric}/>
   <div className={styles.comparison}><div><span>Volledige cohorten in deze periode</span><strong>{metricValue(metric.current,metric.unit)}</strong><small>{metric.unit==='percent'?`${metric.numerator} / ${metric.denominator} cohortstarts (per dag)`:`${metric.numerator} waarnemingen`} · {metric.sampleDays} volledige dagen</small></div><div><span>Verandering tegenover vorige periode</span><strong>{metric.delta===null?'—':`${metric.delta>0?'+':''}${metric.delta.toLocaleString('nl-NL',{maximumFractionDigits:1})}${metric.unit==='percent'?' pp':''}`}</strong><small>{metric.previous===null?'Nog geen vergelijkbare, volledig gemeten voorgaande periode.':`${metricValue(metric.previous,metric.unit)} in de voorgaande ${metric.previousDays} volledige dagen.`}</small></div></div>
   {metric.denominator>0&&metric.denominator<30&&<p className={styles.smallSample}>Kleine steekproef: {metric.denominator} starters. Bekijk het aantal naast het percentage; dit is nog geen bewezen trend of effect van een experiment.</p>}
   <div className={styles.next}><strong>Het uiteindelijke conversiedoel</strong><p>{metric.goal}</p><small>{metric.next}</small></div>
  </section>
  <section className={styles.insight}><p className={styles.kicker}>VOLGENDE GROEIBESLISSING</p><h2>{actionable?`Onderzoek de stap: ${actionable.title.toLowerCase()}.`:'Eerst een betrouwbare nulmeting opbouwen.'}</h2><p>{actionable?`${actionable.numerator} van ${actionable.denominator} starters bereikten het gemeten doel in volledige cohorten. Bekijk de dagelijkse lijn en onderzoek de frictie in deze stap; dit bewijst de oorzaak niet.`:'De volledige cohorten zijn nog klein of ontbreken. Gebruik de voorlopige dagpunten om te zien wat er binnenkomt en wacht met conclusies over verbetering.'}</p><p>Verander één stap tegelijk. Noteer de releasedatum en vergelijk daarna dezelfde doelgroep, hetzelfde venster en dezelfde teller/noemer.</p></section>
  <details className={styles.quality}><summary>Meetdekking en datakwaliteit</summary><p>{data.quality.events.toLocaleString('nl-NL')} ontvangen app-events van {data.quality.users} unieke gebruikers in de beschikbare 90 dagen. Eerste beschikbare event: {data.historyStart?new Date(data.historyStart).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'}):'nog niet aanwezig'}.</p><ul><li>De eerste meetdag is onvolledig en telt niet mee in percentages. Eerdere dagen zijn onbekend, nooit 0%.</li><li>Binnen een dag wordt een gebruiker één keer per cohort geteld. Over meerdere dagen wegen we de tellers en noemers; dezelfde gebruiker kan meerdere startdagen hebben. Gebruikers worden op de server ontdubbeld; rol-totalen worden niet opgeteld. {data.quality.unknownRoleUsers} gebruikers hebben events met een onbekende rol.</li><li>Funnels volgen dezelfde gebruiker op dezelfde kalenderdag, in ontvangstvolgorde (servertijd en event-ID). Late ontvangst kan een handeling op een andere dag plaatsen.</li><li>Een schermbezoek of klik is een gedragsproxy. Geen gelezen onderwerp, geslaagd examen, verstuurde aanvraag of opgeslagen les zonder resultaatbewijs.</li><li>Accountrecords zijn geen installaties of anonieme bezoekers. Accounts die alleen aan interne scholen zijn gekoppeld worden standaard uitgesloten; onbekende/ongekoppelde testaccounts zijn niet betrouwbaar herkenbaar.</li><li>Refunds, nul-eurofacturen en actieve abonnementstatussen maken omzetconversie niet zelfstandig meetbaar. Ontbrekende bronnen leveren een gat, geen 0.</li><li>Dit overzicht toont uitsluitend aggregaten. De onderliggende persoonsgegevens of events zijn niet opvraagbaar vanuit deze pagina.</li></ul>{incomplete.length>0&&<p role="status">Niet volledig beschikbaar: {incomplete.map(([name,state])=>`${name}: ${state.reason??state.status}`).join(' · ')}. De betrokken metingen blijven leeg.</p>}</details>
  <section className={styles.catalogue}><h2>Alle doelen en hun bewijs</h2><div className={styles.tableWrap}><table><thead><tr><th>Fase / meting</th><th>Conversiedoel</th><th>Bewijsstatus</th><th>Wat is nog nodig?</th></tr></thead><tbody>{data.metrics.map(m=><tr key={m.id}><th scope="row"><button onClick={()=>setSelected(m.id)}>{m.stage}<span>{m.title}</span></button></th><td>{m.goal}</td><td>{stateLabel(m)}</td><td>{m.next}</td></tr>)}</tbody></table></div></section>
 </>;
}
function Trend({metric}:{metric:Metric}){
 const [index,setIndex]=useState(metric.daily.length-1), [smooth,setSmooth]=useState(false);
 const points=metric.daily, observed=points[index], valid=points.filter(p=>p.value!==null);
 if(!valid.length)return <div className={styles.noData}><strong>{metric.evidence==='missing'?'Deze conversie is nog niet meetbaar.':'Nog geen meetbare dagpunten.'}</strong><p>{metric.next}</p><p>Ontbrekende historie en lege cohorten worden niet als 0% getekend.</p></div>;
 const max=metric.unit==='percent'?100:Math.max(1,...valid.map(p=>p.value??0));
 const width=880,height=220,padding=8;
 const paths=linePaths(points.map(p=>p.value),width,height,max);
 const rolling=rollingRate(points);
 const x=points.length<=1?width/2:index/(points.length-1)*width;
 const describe=(p:DailyPoint)=>p.reason==='before_history'?'Geen volledige meetdag':p.reason==='unavailable'?'Bron ontbreekt':p.reason==='maturing'?'Cohort nog niet uitgerijpt':p.value===null?'Geen starters in dit cohort':`${metricValue(p.value,metric.unit)}${metric.unit==='percent'?` · ${p.numerator}/${p.denominator}`:` · ${p.numerator} waarnemingen`}${p.provisional?' · voorlopig':''}`;
 return <><div className={styles.chartLegend}><span>Dagelijks · {metric.unit==='percent'?'conversiepercentage':'aantal'}</span>{metric.unit==='percent'&&<label><input type="checkbox" checked={smooth} onChange={e=>setSmooth(e.target.checked)}/> 7-daags gewogen gemiddelde</label>}</div>
  <div className={styles.plot} onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setIndex(Math.max(0,Math.min(points.length-1,Math.round((e.clientX-box.left)/box.width*(points.length-1)))));}}>
   <svg viewBox={`-${padding} -${padding} ${width+padding*2} ${height+padding*2}`} role="img" aria-label={`${metric.title}, dagelijkse lijn. Ontbrekende dagen zijn onderbroken. Gebruik de dagkiezer voor de exacte teller en noemer.`}>
    {[0,.25,.5,.75,1].map(n=><line key={n} x1="0" x2={width} y1={n*height} y2={n*height} className={styles.gridline}/>)}
    {paths.map((d,i)=><path key={i} d={d} className={styles.line}/>)}
    {smooth&&linePaths(rolling,width,height,max).map((d,i)=><path key={i} d={d} className={styles.smoothLine}/>)}
    {points.map((p,i)=>p.value===null?null:<circle key={p.day} cx={points.length<=1?width/2:i/(points.length-1)*width} cy={height-(p.value/max)*height} r={i===index?6:4} className={p.provisional?styles.provisionalPoint:styles.point}><title>{p.day}: {describe(p)}</title></circle>)}
    {observed?.value!==null&&<line x1={x} x2={x} y1="0" y2={height} className={styles.cursor}/>}
   </svg><span className={styles.axisMax}>{metric.unit==='percent'?'100%':max}</span><span className={styles.axisMin}>0{metric.unit==='percent'?'%':''}</span>
  </div>
  <div className={styles.axisDates}><span>{shortDate(points[0].day)}</span><span>{shortDate(points[points.length-1].day)}</span></div>
  <label className={styles.dayPicker}>Dag bekijken<input aria-label="Dag bekijken" type="range" min="0" max={points.length-1} value={index} onChange={e=>setIndex(Number(e.target.value))}/></label>
  <p className={styles.observation} aria-live="polite"><strong>{shortDate(observed.day)}</strong><span>{describe(observed)}</span></p>
  {smooth&&rolling.every(v=>v===null)&&<p className={styles.smallSample}>Het 7-daagse gemiddelde verschijnt zodra zeven volledige meetdagen beschikbaar zijn. Het weegt tellers en noemers; het middelt geen losse percentages.</p>}
  <details className={styles.dayTable}><summary>Dagcijfers en noemers bekijken</summary><div className={styles.tableWrap}><table><thead><tr><th>Dag</th><th>Teller</th><th>Noemer</th><th>{metric.unit==='percent'?'Conversie':'Aantal'}</th><th>Status</th></tr></thead><tbody>{points.map(p=><tr key={p.day}><td>{p.day}</td><td>{p.numerator??'—'}</td><td>{p.denominator??'—'}</td><td>{metricValue(p.value,metric.unit)}</td><td>{p.provisional?'Voorlopig':p.reason==='before_history'?'Onbekende historie':p.reason==='maturing'?'Nog niet uitgerijpt':p.reason==='unavailable'?'Bron ontbreekt':p.reason==='empty'?'Geen starters':'Volledig'}</td></tr>)}</tbody></table></div></details>
 </>;
}
