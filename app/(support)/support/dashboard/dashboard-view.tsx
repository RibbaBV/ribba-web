import Link from 'next/link';
import {topics} from '@/lib/owner-journey';
import {attentionLabels,type GrowthDashboard} from '@/lib/owner-dashboard';
import {Banner,Button,Explainer,Footer,Funnel,Grid,Kpi,Kpis,LinkTile,Page,PageHeader,Panel,Pill,Row,Rows,Segmented,StateMessage,Empty,Note} from '../ui/kit';
import styles from './dashboard.module.css';
const format=(date:string)=>new Date(date).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'});
const PERIODES=[7,30] as const;
/** Render owner growth totals, attention signals and proposals alongside their saved evidence and loading or error states. */
export default function DashboardView({data,error,collecting,unauthorized,days,onDays,onRetry,insight,aiBusy,aiError,stale,onPropose}:{
 data:GrowthDashboard|null;error?:string;collecting:boolean;unauthorized:boolean;days:7|30;
 onDays:(days:7|30)=>void;onRetry:()=>void;insight?:GrowthDashboard['latest_ai'];aiBusy:boolean;aiError?:string;stale:boolean;onPropose:()=>void;
}){
 const olderInsight=!!(insight&&data&&(Date.parse(insight.snapshot_at)!==Date.parse(data.captured_at)||(insight.result.evidence?.days!==undefined&&insight.result.evidence.days!==days)));
 return <Page>
  <PageHeader eyebrow="Ribba · beheer" title="Overzicht." subtitle="Hoe Ribba groeit, en welke rijscholen vandaag je aandacht nodig hebben."
   actions={<Segmented label="Periode" options={PERIODES} value={days} onChange={onDays} format={n=>`${n} dagen`}/>}/>
  {unauthorized?<p><Link href="/support">Log opnieuw in met tweefactor om verder te gaan.</Link></p>
  :error?<StateMessage error={error} onRetry={onRetry}/>
  :!data?<StateMessage>{collecting?'De eerste meting moet nog worden verzameld. Er worden geen geschatte cijfers getoond.':'Meetgegevens laden…'}</StateMessage>
  :<>
   {stale?<Banner tone="warn" role="alert">De laatste meting is ouder dan 30 uur. Deze cijfers kunnen achterlopen; AI-analyse is tijdelijk uitgeschakeld.</Banner>
    :<Conclusion data={data} days={days}/>}
   <Kpis>
    <Kpi label="Rijscholen" value={data.metrics.schools.toLocaleString('nl-NL')} note="bij de laatste meting, zonder testscholen"/>
    <Kpi label="Nieuwe rijscholen" value={data.metrics.new} delta={{value:data.metrics.new-data.metrics.previous_new,suffix:`t.o.v. vorige ${days} dagen`}}/>
    <Kpi label="Scholen met registraties" value={data.metrics.active} delta={{value:data.metrics.active-data.metrics.previous_active,suffix:`t.o.v. vorige ${days} dagen`}}/>
    <Kpi label="Aangemaakte lessen" value={data.metrics.lessons.toLocaleString('nl-NL')} delta={{value:data.metrics.lessons-data.metrics.previous_lessons,suffix:`t.o.v. vorige ${days} dagen`}}/>
   </Kpis>
   <Grid>
    <Panel id="groei" title="Aantal rijscholen" note="Laatste meetstand per dag, hooguit 35 dagen">
     {data.trend.length<2?<Empty>De groeilijn verschijnt zodra er metingen van meerdere dagen zijn.</Empty>:<Trend trend={data.trend}/>}
    </Panel>
    <Panel id="aandacht" title="Vandaag aandacht nodig" note={`${data.attention.length} ${data.attention.length===1?'rijschool':'rijscholen'} bij de laatste meting`}>
     {data.attention.length===0?<Empty>Geen rijscholen die aandacht nodig hebben.</Empty>:
     <Rows>{data.attention.map(item=><Row key={item.school_id} title={item.name} sub={attentionLabels[item.reason]}
      end={<Link className={styles.open} href={`/support/${item.school_id}`}>Openen →</Link>}/>)}</Rows>}
    </Panel>
   </Grid>
   <Grid>
    <Panel id="eerste-les" title="Van aanmelding naar eerste les" note={`De ${data.onboarding.total} nieuwe ${data.onboarding.total===1?'rijschool':'rijscholen'} van de laatste ${days} dagen`}>
     {data.onboarding.total===0?<Empty>Geen nieuwe rijscholen in deze periode.</Empty>:
     <Funnel max={data.onboarding.total} steps={[
      {label:'Aangemeld',value:data.onboarding.total},
      {label:'Naam, e-mail en plaats ingevuld',value:data.onboarding.profile},
      {label:'Lestype aangezet',value:data.onboarding.lesson_type},
      {label:'Eerste les aangemaakt',value:data.onboarding.first_lesson,tone:'ok'},
     ]}/>}
    </Panel>
    <Panel id="ai" title="AI-voorstellen" note="Van een meetbaar aandachtspunt naar een klein experiment."
     actions={<Button primary disabled={aiBusy||stale} onClick={onPropose}>{aiBusy?'Voorstellen maken…':insight?'Vernieuw analyse':'Maak voorstellen'}</Button>}>
     {aiError&&<Banner tone="bad" role="alert">{aiError}</Banner>}
     {olderInsight&&<p className={styles.pillLine}><Pill tone="warn">Andere meetstand of periode</Pill></p>}
     {!insight?<Empty>Laat AI hooguit drie experimenten voorstellen op basis van je tellingen. Jij beslist wat je uitvoert.</Empty>
     :insight.result.suggestions.length===0?<Empty>Er is nog te weinig aanleiding voor een onderbouwd voorstel.</Empty>
     :<div className={styles.suggestions}>{insight.result.suggestions.map((s,i)=><details className={styles.suggestion} key={`${insight.created_at}-${i}`} open={i===0}>
       <summary>{s.title}</summary><p><strong>Hypothese:</strong> {s.hypothesis}</p><p><strong>Probeer:</strong> {s.action}</p><p><strong>Meet het effect:</strong> {s.measure}</p></details>)}</div>}
     {insight&&<Note>Gemaakt op {format(insight.created_at)}, op basis van de meting van {format(insight.snapshot_at)}.</Note>}
    </Panel>
   </Grid>
   <div className={styles.tiles}>
    <LinkTile href="/support/dashboard/inschrijvingen" title="Inschrijvingen" sub="Wie schreef zich in, wie betaalt"/>
    <LinkTile href="/support/dashboard/journey" title="Appmetingen" sub="Wizard en pakketaanmaak"/>
   </div>
   <Footer>Bijgewerkt: {format(data.captured_at)}, Nederlandse tijd. Testscholen uitgesloten. Definitie v{data.definition_version}.</Footer>
   <Explainer title="Wat meten we en wat bewaren we?">
    <p>Scholen met registraties: minstens één nieuwe les (zonder Plango-import) of factuur in de periode. Dit omvat automatisering en is geen meting van menselijk app-gebruik. Aangemaakte lessen worden geteld op aanmaakdatum, niet op lesdatum. Cijfers en vergelijkingen gebruiken de records die op het meetmoment nog bestaan; eerder verwijderde records kunnen ontbreken.</p>
    <p>Aandachtspunten zijn een aanleiding om te kijken. Vakantie of automatisch aangemaakte records kunnen het beeld beïnvloeden. Historie vanaf {data.history_since}; een dag zonder meting betekent ontbrekende historie, niet nul rijscholen.</p>
    <p>Elke zes uur wordt een meetstand opgeslagen; de laatste stand per Nederlandse dag blijft bewaard. Geen synthetische historie. Cijfers per school blijven maximaal 400 dagen bewaard en verdwijnen bij schoolverwijdering. Platformtotalen blijven drie jaar bewaard, AI-voorstellen 90 dagen. Schoolnamen worden alleen voor dit scherm opgehaald.</p>
    <p>Alleen geaggregeerde tellingen gaan naar AI, geen namen, gebruikers-ID’s of leerlinggegevens. Maximaal vier analyses per 24 uur. Voorstellen zijn hypotheses; er worden geen wijzigingen of berichten uitgevoerd.</p>
    {insight?.result.evidence&&<p>Onderbouwing van de AI-voorstellen: {insight.result.evidence.metrics.new} nieuwe rijscholen, {insight.result.evidence.metrics.active} scholen met registraties en {insight.result.evidence.metrics.lessons} aangemaakte lessen in {insight.result.evidence.days} dagen.</p>}
    {insight?.result.evidence?.journey&&<p>Support, laatste {insight.result.evidence.journey.support_window_days} dagen: {insight.result.evidence.journey.topics.length===0?'geen geregistreerde hulpvragen':insight.result.evidence.journey.topics.map(t=>`${topics[t.topic as keyof typeof topics]??t.topic}: ${t.cases} vragen bij ${t.schools} scholen (${t.open} open)`).join('; ')}.</p>}
    {insight?.result.evidence?.learners&&<p>Leerlingen, gemeten op {format(insight.result.evidence.learners.captured_at)}: {insight.result.evidence.learners.new_30} nieuwe accounts in 30 dagen, {insight.result.evidence.learners.never_signed_in} nog niet ingelogd en {insight.result.evidence.learners.incomplete_without_school} onvolledige profielen zonder actieve school. Bekende testaccounts uitgesloten.</p>}
   </Explainer>
  </>}
 </Page>;
}
/** De conclusie bovenaan: aandacht eerst, anders groei. */
function Conclusion({data,days}:{data:GrowthDashboard;days:7|30}){
 const n=data.attention.length;
 if(n>0)return <Banner tone="warn">{n===1?'1 rijschool heeft':`${n} rijscholen hebben`} vandaag aandacht nodig.</Banner>;
 const nieuw=data.metrics.new;
 return <Banner tone="ok">Geen rijscholen die aandacht nodig hebben. {nieuw===0?`Geen nieuwe rijscholen in de laatste ${days} dagen.`:`${nieuw} nieuwe ${nieuw===1?'rijschool':'rijscholen'} in de laatste ${days} dagen.`}</Banner>;
}
function Trend({trend}:{trend:GrowthDashboard['trend']}){
 const max=Math.max(1,...trend.map(p=>p.schools));
 const dag=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('nl-NL',{day:'numeric',month:'short',timeZone:'Europe/Amsterdam'});
 return <div className={styles.chart} role="img" aria-label={trend.map(p=>`${p.day}: ${p.schools} rijscholen`).join('; ')}>
  {trend.map((p,i)=><div key={p.day} className={styles.column} title={`${dag(p.day)}: ${p.schools} rijscholen`}>
   <span className={styles.value}>{trend.length<=10||i===trend.length-1?p.schools:''}</span>
   <div className={styles.plot}><div className={styles.bar} style={{height:`${p.schools/max*100}%`}}/></div>
   <small>{i===0||i===trend.length-1?dag(p.day):''}</small>
  </div>)}
 </div>;
}
