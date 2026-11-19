'use client';
import {dayLabel,daysSince,percentage,signupsByMonth,stageLabels,type MonthGroup,type SignupStage,type SignupWeeks} from '@/lib/owner-signups';
import styles from '../../support-design.module.css';
import local from './inschrijvingen.module.css';
const date=(value:string)=>new Date(value).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'});
/** Na zoveel dagen zonder inschrijving kleurt de melding bovenaan geel. */
const STIL_NA_DAGEN=14;
/** Het inschrijvingendashboard zelf: puur weergave van één geldige payload. */
export function Dashboard({data}:{data:SignupWeeks}){
 const t=data.totals;
 const klant=percentage(t.paying,t.started);
 return <>
  <LastSignup data={data}/>
  <div className={`${styles.stats} ${local.kpis}`}>
   <article className={styles.stat}><span>Inschrijvingen</span><strong>{t.started}</strong><small>in de laatste {data.weeks_requested} weken</small></article>
   <article className={styles.stat}><span>Betalend</span><strong className={local.ok}>{t.paying}</strong><small>klanten die nu betalen</small></article>
   <article className={styles.stat}><span>In proef</span><strong className={local.info}>{t.trialing}</strong><small>beslissen binnenkort</small></article>
   <article className={styles.stat}><span>Wordt klant</span><strong>{klant===null?'—':`${klant}%`}</strong><small>{t.paying} van de {t.started}</small></article>
  </div>
  <div className={local.duo}>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="trechter"><h2 id="trechter">Hoe ver komen ze</h2>
    <Funnel steps={[['Begonnen',t.started,'blue'],['Betaalgegevens ingevuld',t.checkout,'blue'],['Account aangemaakt',t.activated,'blue'],['Betaalt',t.paying,'green']]} max={t.started}/>
    {t.abandoned>0&&<p className={local.note}>{t.abandoned} afgehaakt: na {data.abandon_after_days} dagen nog geen betaalgegevens.</p>}
   </section>
   <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="maanden"><h2 id="maanden">Per maand</h2>
    <Months data={data}/>
   </section>
  </div>
  <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="wie"><h2 id="wie">Wie schreef zich in</h2>
   {data.signups.length===0?<p className={local.note}>Geen inschrijvingen in deze periode.</p>:
   <ul className={local.list}>{data.signups.map(s=><li key={`${s.created_at}:${s.name}`}>
    <div className={local.who}><strong>{s.name}</strong>{s.city&&<span>{s.city}</span>}</div>
    <time dateTime={s.created_at}>{dayLabel(s.created_at)}</time>
    <span className={`${local.pill} ${local[pillClass(s.stage)]}`}>{stageLabels[s.stage]}</span>
   </li>)}</ul>}
  </section>
  <p className={local.footer}>{data.excluded_tests>0&&<>{data.excluded_tests} {data.excluded_tests===1?'testinschrijving':'testinschrijvingen'} niet meegeteld. </>}Proef en betalend zijn de stand van vandaag. Bijgewerkt: {date(data.captured_at)}.</p>
 </>;
}
function LastSignup({data}:{data:SignupWeeks}){
 if(!data.last_signup_at)return <p className={`${local.banner} ${local.bannerWarn}`}>Er heeft zich nog geen rijschool via de website ingeschreven.</p>;
 const dagen=daysSince(data.last_signup_at,data.captured_at);
 const wanneer=dagen===0?'vandaag':dagen===1?'gisteren':`${dagen} dagen geleden`;
 return <p className={`${local.banner} ${dagen>=STIL_NA_DAGEN?local.bannerWarn:local.bannerOk}`}>Laatste inschrijving was op {dayLabel(data.last_signup_at)}, {wanneer}.</p>;
}
function Funnel({steps,max}:{steps:[string,number,'blue'|'green'][];max:number}){
 return <div className={local.funnel}>{steps.map(([label,n,kleur])=><div key={label}>
  <div className={local.funnelHead}><span>{label}</span><strong>{n}</strong></div>
  <div className={local.track}><div className={`${local.bar} ${kleur==='green'?local.barGreen:''}`} style={{width:`${max?Math.round(n/max*100):0}%`}}/></div>
 </div>)}</div>;
}
const GROEPEN:[MonthGroup,string][]=[['paying','betaalt'],['trialing','in proef'],['other','nog bezig of gestopt'],['abandoned','afgehaakt']];
function Months({data}:{data:SignupWeeks}){
 const maanden=signupsByMonth(data.signups,data.from,data.captured_at);
 const hoogste=Math.max(1,...maanden.map(m=>m.total));
 const zichtbaar=GROEPEN.filter(([g])=>maanden.some(m=>m.counts[g]>0));
 return <>
  <div className={local.months} role="img" aria-label={maanden.map(m=>`${m.label}: ${m.total}`).join(', ')}>
   {maanden.map(m=><div key={m.key} className={local.month}>
    <span className={local.monthTotal}>{m.total||''}</span>
    <div className={local.stack} style={{height:`${m.total/hoogste*100}%`}}>
     {GROEPEN.map(([g])=>m.counts[g]>0&&<div key={g} className={local[`seg_${g}`]} style={{flexGrow:m.counts[g]}}/>)}
    </div>
    <span className={local.monthLabel}>{m.label}</span>
   </div>)}
  </div>
  {zichtbaar.length>0&&<div className={local.legend}>{zichtbaar.map(([g,l])=><span key={g}><i className={local[`seg_${g}`]}/>{l}</span>)}</div>}
 </>;
}
function pillClass(s:SignupStage):'pillOk'|'pillInfo'|'pillBad'|'pillNeutral'{
 return s==='paying'?'pillOk':s==='trialing'?'pillInfo':s==='abandoned'||s==='stopped'?'pillBad':'pillNeutral';
}
