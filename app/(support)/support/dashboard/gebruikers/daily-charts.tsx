'use client';

import {useState, type PointerEvent} from 'react';
import {Button, Segmented} from '../../ui/kit';
import type {UsageDay, UserSelection} from '@/lib/support-usage';
import s from './daily-charts.module.css';

type Kind = 'learner' | 'school';
type Metric = 'new' | 'active';
type Series = {label:string; color:string; cohort:UserSelection['cohort']; value:(day:UsageDay)=>number};
const date = (day:string, long=false) => new Date(`${day}T12:00:00Z`).toLocaleDateString('nl-NL', {timeZone:'Europe/Amsterdam', day:'numeric', month:long?'long':'short'});
const number = (value:number) => value.toLocaleString('nl-NL');
const colors = {without:'#6ee7c0', with:'#80b7ff', unknown:'#a3adbd'};
function seriesFor(kind:Kind, metric:Metric):Series[] {
 if(kind==='school')return [{label:'Rijschoolgebruikers',color:colors.with,cohort:'all',value:d=>metric==='new'?d.new_school_users:d.active_school_users}];
 return [
  {label:'Zonder rijschool',color:colors.without,cohort:'without_school',value:d=>metric==='new'?d.new_without_school:d.active_without_school},
  {label:'Met rijschool',color:colors.with,cohort:'with_school',value:d=>metric==='new'?d.new_with_school:d.active_with_school},
  ...(metric==='new'?[{label:'Indeling onbekend',color:colors.unknown,cohort:'unknown' as const,value:(d:UsageDay)=>d.new_unknown}]:[]),
 ];
}

export default function DailyCharts({days,onOpen}:{days:UsageDay[];onOpen:(filter:Partial<UserSelection>)=>void}){
 const [kind,setKind]=useState<Kind>('learner');
 if(!days.length)return <p>Er zijn nog geen dagcijfers beschikbaar.</p>;
 return <>
  <div className={s.toolbar}>
   <Segmented label="Gebruikers in grafieken" options={['learner','school'] as const} value={kind} onChange={setKind} format={v=>v==='learner'?'Leerlingen':'Rijschoolgebruikers'}/>
   <span>{date(days.at(-1)!.day)} – {date(days[0].day)}</span>
  </div>
  <div className={s.cards}>
   <Chart key={`new-${kind}`} days={days} kind={kind} metric="new" onOpen={onOpen}/>
   <Chart key={`active-${kind}`} days={days} kind={kind} metric="active" onOpen={onOpen}/>
  </div>
 </>;
}

function Chart({days,kind,metric,onOpen}:{days:UsageDay[];kind:Kind;metric:Metric;onOpen:(filter:Partial<UserSelection>)=>void}){
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const ordered=[...days].reverse();
 const found=selectedDay?ordered.findIndex(d=>d.day===selectedDay):-1;
 const index=found<0?ordered.length-1:found;
 const selected=ordered[index];
 const series=seriesFor(kind,metric);
 const measured=(day:UsageDay)=>metric==='new'||day.measured;
 const total=(day:UsageDay)=>series.reduce((n,line)=>n+line.value(day),0);
 const periodTotal=ordered.reduce((n,d)=>n+total(d),0);
 const selectedTotal=measured(selected)?total(selected):null;
 const maxValue=Math.max(1,...ordered.filter(measured).map(d=>metric==='new'?total(d):Math.max(...series.map(line=>line.value(d)))));
 const ceiling=Math.max(2,Math.ceil(maxValue/2)*2);
 const left=38, right=552, top=24, bottom=200, width=576;
 const step=(right-left)/ordered.length;
 const x=(i:number)=>left+(i+.5)*step;
 const y=(value:number)=>bottom-(value/ceiling)*(bottom-top);
 const title=metric==='new'?'Nieuwe gebruikers':'Dagelijks actief';
 const firstMeasured=ordered.findIndex(measured);
 function point(event:PointerEvent<SVGSVGElement>){
  const bounds=event.currentTarget.getBoundingClientRect();
  const position=(event.clientX-bounds.left)/bounds.width*width;
  const next=Math.max(0,Math.min(ordered.length-1,Math.floor((position-left)/step)));
  setSelectedDay(ordered[next].day);
 }
 const noun=kind==='learner'?'leerlingen':'rijschoolgebruikers';
 return <article className={s.card} aria-label={`${title} · ${noun}`}>
  <header className={s.header}>
   <h3>{metric==='new'?`Nieuwe ${noun}`:`Actieve ${noun}`}</h3>
   <p className={s.big}>{metric==='new'?number(periodTotal):selectedTotal===null?'—':number(selectedTotal)}<span>{metric==='new'?`in ${days.length} dagen`:`op ${date(selected.day)}`}</span></p>
   <p className={s.subtitle}>{metric==='new'?kind==='learner'?'Nieuwe accounts, uitgesplitst bij registratie.':'Nieuwe accounts van rijschoolgebruikers.':'Unieke gebruikers met de app op de voorgrond.'}</p>
  </header>
  <div className={s.plot}>
   <svg viewBox={`0 0 ${width} 238`} role="img" aria-label={`${title}, ${date(ordered[0].day)} tot ${date(ordered.at(-1)!.day)}. Kies hieronder een dag voor exacte aantallen.`} onPointerMove={point} onPointerDown={point}>
    {firstMeasured!==0&&<rect x={left} y={top} width={firstMeasured<0?right-left:step*firstMeasured} height={bottom-top} fill="#ffffff05"/>}
    {[ceiling,ceiling/2,0].map(tick=><g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity=".13" strokeDasharray={tick?'3 5':undefined}/><text x={left-10} y={y(tick)+4} textAnchor="end" className={s.axis}>{number(tick)}</text></g>)}
    {metric==='new'?ordered.map((day,i)=>{
     let stacked=0;
     return <g key={day.day} opacity={i===index?1:.72}>{series.map(line=>{
      const value=line.value(day), start=stacked;stacked+=value;
      return value>0?<rect key={line.cohort} x={x(i)-Math.min(18,step*.65)/2} y={y(stacked)} width={Math.min(18,step*.65)} height={y(start)-y(stacked)} rx="2" fill={line.color}/>:null;
     })}</g>;
    }):series.map(line=>{
     let path='';let connected=false;
     ordered.forEach((day,i)=>{if(!measured(day)){connected=false;return;}path+=`${connected?'L':'M'}${x(i)},${y(line.value(day))} `;connected=true;});
     return <g key={line.cohort}><path d={path} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{ordered.filter(measured).length===1&&ordered.map((day,i)=>measured(day)?<circle key={day.day} cx={x(i)} cy={y(line.value(day))} r="4" fill={line.color}/>:null)}</g>;
    })}
    <line x1={x(index)} x2={x(index)} y1={top} y2={bottom} stroke="currentColor" strokeOpacity=".3" strokeDasharray="3 4"/>
    {metric==='active'&&measured(selected)&&series.map(line=><circle key={line.cohort} cx={x(index)} cy={y(line.value(selected))} r="4" fill={line.color} stroke="#122237" strokeWidth="2"/>)}
    <text x={left} y="226" className={s.axis}>{date(ordered[0].day)}</text>
    <text x={(left+right)/2} y="226" textAnchor="middle" className={s.axis}>{date(ordered[Math.floor(ordered.length/2)].day)}</text>
    <text x={right} y="226" textAnchor="end" className={s.axis}>{date(ordered.at(-1)!.day)}</text>
   </svg>
  </div>
  <label className={s.scrubber}>Dag bekijken
   <input type="range" min="0" max={ordered.length-1} value={index} aria-label={`Dag voor ${title.toLowerCase()}`} aria-valuetext={date(selected.day,true)} onChange={e=>setSelectedDay(ordered[Number(e.target.value)].day)}/>
  </label>
  <div className={s.selection} aria-live="polite" aria-atomic="true"><strong>{date(selected.day,true)}{selected.day===days[0].day?' · vandaag':''}</strong><span>{selectedTotal===null?'Nog niet gemeten':`${number(selectedTotal)} ${metric==='new'?'nieuw':'actief'}`}</span></div>
  <div className={s.legend}>{series.map(line=><button key={line.cohort} disabled={!measured(selected)} onClick={()=>onOpen({kind,metric,day:selected.day,cohort:line.cohort})} aria-label={`${date(selected.day,true)}: ${measured(selected)?line.value(selected):'niet gemeten'} ${line.label.toLowerCase()} bekijken`}><span className={s.dot} style={{background:line.color}}/><span>{line.label}</span><strong>{measured(selected)?number(line.value(selected)):'—'}</strong><span aria-hidden="true">↗</span></button>)}</div>
  {metric==='active'&&<p className={s.footnote}>{firstMeasured<0?'Voor deze periode is nog geen activiteit gemeten.':firstMeasured>0?`Meting vanaf ${date(ordered[firstMeasured].day)}. Het lichte vlak is nog niet gemeten.`:'Actief per dag. Dezelfde gebruiker kan op meerdere dagen terugkomen.'} De eerste meetdag en vandaag kunnen onvolledig zijn.</p>}
  {metric==='new'&&<p className={s.footnote}>{kind==='learner'?'Bij oudere accounts is de schoolindeling op de registratiedag soms onbekend. Deze staan apart in grijs.':'Elke nieuwe rijschoolgebruiker telt één keer mee, op de registratiedag.'}</p>}
  <Button onClick={()=>onOpen({kind,metric,day:selected.day,cohort:'all'})} disabled={!measured(selected)}>Personen van deze dag bekijken</Button>
 </article>;
}
