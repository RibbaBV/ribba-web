'use client';
import {dayLabel,daysSince,originLabels,originText,percentage,signupsByMonth,stageLabels,type MonthGroup,type SignupStage,type SignupWeeks} from '@/lib/owner-signups';
import {Banner,Empty,Explainer,Footer,Funnel,Grid,Kpi,Kpis,Note,Panel,Pill,Row,Rows,type Tone} from '../../ui/kit';
import local from './inschrijvingen.module.css';
const date=(value:string)=>new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Amsterdam'});
/** Na zoveel dagen zonder inschrijving kleurt de melding bovenaan geel. */
const STIL_NA_DAGEN=14;
/** Het inschrijvingendashboard zelf: puur weergave van één geldige payload. */
export function Dashboard({data}:{data:SignupWeeks}){
 const t=data.totals;
 const klant=percentage(t.paying,t.started);
 return <>
  <LastSignup data={data}/>
  <Kpis>
   <Kpi label="Inschrijvingen" value={t.started} note={`in de laatste ${data.weeks_requested} weken`}/>
   <Kpi label="Betalend" value={t.paying} tone="ok" note="klanten die nu betalen"/>
   <Kpi label="In proef" value={t.trialing} tone="info" note="beslissen binnenkort"/>
   <Kpi label="Wordt klant" value={klant===null?'—':`${klant}%`} note={`${t.paying} van de ${t.started}`}/>
  </Kpis>
  <Grid>
   <Panel id="trechter" title="Hoe ver komen ze">
    <Funnel max={t.started} steps={[{label:'Begonnen',value:t.started},{label:'Betaalgegevens ingevuld',value:t.checkout},{label:'Account aangemaakt',value:t.activated},{label:'Betaalt',value:t.paying,tone:'ok'}]}/>
    {t.abandoned>0&&<Note>{t.abandoned} afgehaakt: na {data.abandon_after_days} dagen nog geen betaalgegevens.</Note>}
   </Panel>
   <Panel id="maanden" title="Per maand"><Months data={data}/></Panel>
  </Grid>
  <Origins data={data}/>
  <Panel id="wie" title="Wie schreef zich in">
   {data.signups.length===0?<Empty>Geen inschrijvingen in deze periode.</Empty>:
   <Rows>{data.signups.map(s=><Row key={`${s.created_at}:${s.name}`} title={s.name} sub={[s.city,s.origin&&originText(s.origin,s.origin_label)].filter(Boolean).join(' · ')||undefined}
    meta={<time dateTime={s.created_at}>{dayLabel(s.created_at)}</time>} end={<Pill tone={stageTone(s.stage)}>{stageLabels[s.stage]}</Pill>}/>)}</Rows>}
  </Panel>
  <Footer>{data.excluded_tests>0&&<>{data.excluded_tests} {data.excluded_tests===1?'testinschrijving':'testinschrijvingen'} niet meegeteld. </>}Proef en betalend zijn de stand van vandaag. Bijgewerkt: {date(data.captured_at)}.</Footer>
 </>;
}
/** Waar komen ze vandaan: één regel per herkomst, met hoeveel er klant werden. */
function Origins({data}:{data:SignupWeeks}){
 if(!data.origins)return <Panel id="herkomst" title="Waar komen ze vandaan"><Empty>Herkomst is nog niet beschikbaar.</Empty></Panel>;
 const metLabel=data.origins.filter(o=>o.origin==='campaign'||o.origin==='ad').reduce((n,o)=>n+o.started,0);
 const totaal=data.origins.reduce((n,o)=>n+o.started,0);
 return <Panel id="herkomst" title="Waar komen ze vandaan" note={totaal===0?undefined:`${metLabel} van de ${totaal} met een campagne- of advertentielabel`}>
  {data.origins.length===0?<Empty>Geen inschrijvingen in deze periode.</Empty>:<>
   <Rows>{data.origins.map(o=><Row key={`${o.origin}:${o.label??''}`} title={originText(o.origin,o.label)}
    meta={`${o.started} ${o.started===1?'inschrijving':'inschrijvingen'}`}
    end={<Pill tone={o.customers>0?'ok':'neutral'}>{o.customers} klant</Pill>}/>)}</Rows>
   {totaal>0&&metLabel===0&&<Note>Geen enkele inschrijving had een campagnelabel. Links in mails en advertenties hebben een utm-label nodig om hier als campagne te verschijnen.</Note>}
  </>}
  <Explainer title="Hoe bepalen we de herkomst?">
   <p>Elke inschrijving telt één keer, in de eerste groep die past: {(['tip','campaign','ad','website','other_site','unknown'] as const).map(o=>originLabels[o]).join(', ')}.</p>
   <p>Campagne betekent een utm-label in de link; advertentie een klik-ID van Google, Microsoft of Meta. Via ribba.nl betekent dat iemand vanaf onze website doorklikte, zonder label. Onbekend is niet hetzelfde als direct: browsers geven lang niet altijd door waar iemand vandaan kwam.</p>
   <p>Klant betekent nu in proef of betalend. Van andere websites tonen we alleen de domeinnaam.</p>
  </Explainer>
 </Panel>;
}
function LastSignup({data}:{data:SignupWeeks}){
 if(!data.last_signup_at)return <Banner tone="warn">Er heeft zich nog geen rijschool via de website ingeschreven.</Banner>;
 const dagen=daysSince(data.last_signup_at,data.captured_at);
 const wanneer=dagen===0?'vandaag':dagen===1?'gisteren':`${dagen} dagen geleden`;
 return <Banner tone={dagen>=STIL_NA_DAGEN?'warn':'ok'}>Laatste inschrijving was op {dayLabel(data.last_signup_at)}, {wanneer}.</Banner>;
}
const GROEPEN:[MonthGroup,string][]=[['paying','betaalt'],['trialing','in proef'],['other','nog bezig of gestopt'],['abandoned','afgehaakt']];
function Months({data}:{data:SignupWeeks}){
 const maanden=signupsByMonth(data.signups,data.from,data.captured_at);
 const hoogste=Math.max(1,...maanden.map(m=>m.total));
 const zichtbaar=GROEPEN.filter(([g])=>maanden.some(m=>m.counts[g]>0));
 return <>
  <div className={local.months} role="img" aria-label={maanden.map(m=>`${m.label}: ${m.total}${m.total?` (${GROEPEN.filter(([g])=>m.counts[g]>0).map(([g,l])=>`${m.counts[g]} ${l}`).join(', ')})`:''}`).join('; ')}>
   {maanden.map(m=><div key={m.key} className={local.month}>
    <span className={local.monthTotal}>{m.total||''}</span>
    <div className={local.plot}><div className={local.stack} style={{height:`${m.total/hoogste*100}%`}}>
     {GROEPEN.map(([g])=>m.counts[g]>0&&<div key={g} className={local[`seg_${g}`]} style={{flexGrow:m.counts[g]}}/>)}
    </div></div>
    <span className={local.monthLabel}>{m.label}</span>
   </div>)}
  </div>
  {zichtbaar.length>0&&<div className={local.legend}>{zichtbaar.map(([g,l])=><span key={g}><i className={local[`seg_${g}`]}/>{l}</span>)}</div>}
 </>;
}
function stageTone(s:SignupStage):Tone{
 return s==='paying'?'ok':s==='trialing'?'info':s==='abandoned'||s==='stopped'?'bad':'neutral';
}
