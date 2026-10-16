import Link from 'next/link';
import RibbaLogo from '../../../components/RibbaLogo';
import {attentionLabels,type GrowthDashboard} from '@/lib/owner-dashboard';
import styles from './dashboard.module.css';
const format=(date:string)=>new Date(date).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'});
export default function DashboardView({data,error,collecting,unauthorized,days,onDays,onRetry,insight,aiBusy,aiError,stale,onPropose}:{
 data:GrowthDashboard|null;error?:string;collecting:boolean;unauthorized:boolean;days:7|30;
 onDays:(days:7|30)=>void;onRetry:()=>void;insight?:GrowthDashboard['latest_ai'];aiBusy:boolean;aiError?:string;stale:boolean;onPropose:()=>void;
}){
 return <div className={styles.page}>
  <header className={styles.top}><RibbaLogo height={25}/><span>Beheer</span><span className={styles.owner}>Alleen eigenaar</span></header>
  <main className={styles.main}>
   <nav className={styles.nav} aria-label="Beheer"><Link aria-current="page" href="/support/dashboard">Dashboard</Link><Link href="/support">Rijscholen</Link></nav>
   <div className={styles.heading}><div><h1>Zo staat Ribba ervoor.</h1><p>Groei, gebruik en waar je kunt helpen.</p></div><div className={styles.period} aria-label="Periode">{([7,30] as const).map(n=><button key={n} onClick={()=>onDays(n)} aria-pressed={days===n}>{n} dagen</button>)}</div></div>
   {unauthorized?<p><Link href="/support">Log opnieuw in met tweefactor om verder te gaan.</Link></p>:error?<div role="alert"><p>{error}</p><button onClick={onRetry}>Opnieuw proberen</button></div>:!data?<p role="status">{collecting?'De eerste meting moet nog worden verzameld. Er worden geen geschatte cijfers getoond.':'Meetgegevens laden…'}</p>:<>
    {stale&&<p className={styles.warning} role="alert">De laatste meting is ouder dan 30 uur. Deze cijfers kunnen achterlopen; AI-analyse is tijdelijk uitgeschakeld.</p>}
    <div className={styles.stats}>
     <Metric label="Rijscholen bij laatste meting" value={data.metrics.schools}/>
     <Metric label="Nieuwe rijscholen" value={data.metrics.new} previous={data.metrics.previous_new} days={days}/>
     <Metric label="Scholen met registraties" value={data.metrics.active} previous={data.metrics.previous_active} days={days}/>
     <Metric label="Aangemaakte lessen" value={data.metrics.lessons} previous={data.metrics.previous_lessons} days={days}/>
    </div>
    <div className={styles.panels}>
     <section className={styles.card}><h2>Een groeiende basis</h2><p className={styles.note}>Laatste meetstand per dag · maximaal 35 dagen</p>
      {data.trend.length<2?<p className={styles.empty}>De groeilijn verschijnt zodra er metingen van meerdere dagen zijn.</p>:<div className={styles.chart} role="img" aria-label={data.trend.map(p=>`${p.day}: ${p.schools} rijscholen`).join('; ')}>{data.trend.map((point,i)=><div key={point.day} className={styles.barColumn} title={`${point.day}: ${point.schools} rijscholen`}><span>{data.trend.length<=10||i===data.trend.length-1?point.schools:''}</span><div className={styles.bar} style={{height:`${120*point.schools/Math.max(1,...data.trend.map(p=>p.schools))}px`}}/><small>{i===0||i===data.trend.length-1?new Date(point.day+'T12:00:00Z').toLocaleDateString('nl-NL',{day:'numeric',month:'short'}):''}</small></div>)}</div>}
      <p className={styles.note}>Historie vanaf {data.history_since}. Geen meting betekent ontbrekende historie, niet nul rijscholen.</p>
     </section>
     <section className={styles.card}><h2>Van aanmelding naar eerste les</h2><p className={styles.note}>Van de {data.onboarding.total} nieuwe rijscholen in deze {days} dagen</p>
      {data.onboarding.total===0?<p className={styles.empty}>Geen nieuwe rijscholen in deze periode.</p>:[['Naam, e-mail en plaats ingevuld',data.onboarding.profile],['Ingeschakeld lestype',data.onboarding.lesson_type],['Les aangemaakt buiten Plango-import',data.onboarding.first_lesson]].map(([label,value])=><div className={styles.step} key={label}><div>{label}<span>{value} / {data.onboarding.total}</span></div><progress value={Number(value)} max={data.onboarding.total} aria-label={String(label)}/></div>)}
     </section>
    </div>
    <section className={styles.card}><div className={styles.sectionHead}><div><h2>Waar kun je helpen?</h2><p className={styles.note}>{data.attention.length} {data.attention.length===1?'aandachtspunt':'aandachtspunten'} bij de laatste meting</p></div></div>
     {data.attention.length===0?<p>Geen aandachtspunten volgens de huidige meetregels.</p>:data.attention.map(item=><div key={item.school_id} className={styles.school}><div><strong>{item.name}</strong><p className={styles.note}>{attentionLabels[item.reason]}</p></div><Link href={`/support/${item.school_id}`}>School openen ↗</Link></div>)}
     <p className={styles.note}>Een signaal is een aanleiding om te kijken. Vakantie of automatisch aangemaakte records kunnen het beeld beïnvloeden.</p>
    </section>
    <section className={styles.card+' '+styles.ai}><div className={styles.sectionHead}><div><h2>AI-voorstellen voor groei</h2><p className={styles.note}>Van een meetbaar aandachtspunt naar een klein experiment.</p></div><button disabled={aiBusy||stale} onClick={onPropose}>{aiBusy?'Voorstellen maken…':'Maak voorstellen'}</button></div>
     {aiError&&<p role="alert">{aiError}</p>}
     {insight?<><p className={styles.note}>Gemaakt op {format(insight.created_at)} · gebaseerd op de meting van {format(insight.snapshot_at)}</p>{insight.result.evidence&&<p className={styles.note}>Bewaarde onderbouwing: {insight.result.evidence.metrics.new} nieuwe rijscholen, {insight.result.evidence.metrics.active} scholen met registraties en {insight.result.evidence.metrics.lessons} aangemaakte lessen in {insight.result.evidence.days} dagen.</p>}{insight.result.suggestions.length===0?<p>Er is nog te weinig aanleiding voor een onderbouwd voorstel.</p>:insight.result.suggestions.map((s,i)=><article className={styles.suggestion} key={i}><h3>{s.title}</h3><p><strong>Hypothese:</strong> {s.hypothesis}</p><p><strong>Probeer:</strong> {s.action}</p><p><strong>Meet het effect:</strong> {s.measure}</p></article>)}</>:<p>Laat AI maximaal drie experimenten voorstellen op basis van je tellingen. Je beslist zelf wat je uitvoert.</p>}
     <p className={styles.note}>Alleen geaggregeerde tellingen gaan naar AI, geen namen, gebruikers-ID’s of leerlinggegevens. Maximaal vier analyses per 24 uur. Voorstellen zijn hypotheses; er worden geen wijzigingen of berichten uitgevoerd.</p>
    </section>
    <footer className={styles.footer}><span>Bijgewerkt: {format(data.captured_at)} · tijdzone Nederland</span><span>Testscholen uitgesloten · definitie v{data.definition_version}</span></footer>
    <details className={styles.definitions}><summary>Wat meten we en wat bewaren we?</summary><p>Scholen met registraties: minstens één nieuwe les (zonder Plango-import) of factuur in de periode. Dit omvat automatisering en is geen meting van menselijk app-gebruik. Aangemaakte lessen worden geteld op aanmaakdatum, niet op lesdatum. Cijfers en vergelijkingen gebruiken de records die op het meetmoment nog bestaan; eerder verwijderde records kunnen ontbreken.</p><p>Elke zes uur wordt een meetstand opgeslagen; de laatste stand per Nederlandse dag blijft bewaard. Geen synthetische historie. Cijfers per school blijven maximaal 400 dagen bewaard en verdwijnen bij schoolverwijdering. Platformtotalen blijven drie jaar bewaard, AI-voorstellen 90 dagen. Schoolnamen worden alleen voor dit scherm opgehaald.</p></details>
   </>}
  </main>
 </div>;
}
function Metric({label,value,previous,days}:{label:string;value:number;previous?:number;days?:number}){const delta=previous===undefined?null:value-previous;return <section className={styles.card}><p className={styles.note}>{label}</p><div className={styles.number}>{value.toLocaleString('nl-NL')}</div><p className={styles.note}>{delta===null?'Exclusief testscholen':`${delta>0?'+':''}${delta} t.o.v. vorige ${days} dagen`}</p></section>;}
