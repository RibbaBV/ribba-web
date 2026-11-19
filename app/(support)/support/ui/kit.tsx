// Gedeelde bouwstenen voor de supportpagina's (huisstijl, 19 nov 2026).
// Elke pagina bouwt hiermee in dezelfde volgorde: kop, conclusie in één zin,
// kerncijfers, panelen, lijsten, en de uitleg ingeklapt onderaan. Alleen
// weergave: geen data, geen rechten.
import type {ReactNode} from 'react';
import Link from 'next/link';
import k from './kit.module.css';

export type Tone = 'ok'|'info'|'warn'|'bad'|'neutral';

/** Buitenste laag van elke supportpagina: breedte, marges en lettertype. */
export function Page({children}:{children:ReactNode}){return <main className={k.page}>{children}</main>;}

/** Paginakop met optionele acties rechts (periodekeuze, knoppen). */
export function PageHeader({eyebrow,title,subtitle,actions}:{eyebrow:string;title:string;subtitle?:ReactNode;actions?:ReactNode}){
 return <header className={k.header}>
  <div><p className={k.eyebrow}>{eyebrow}</p><h1 className={k.title}>{title}</h1>{subtitle&&<p className={k.subtitle}>{subtitle}</p>}</div>
  {actions&&<div className={k.actions}>{actions}</div>}
 </header>;
}

/** De conclusie van de pagina in één zin. */
export function Banner({tone='info',children,role}:{tone?:Exclude<Tone,'neutral'>;children:ReactNode;role?:'alert'|'status'}){
 return <p className={`${k.banner} ${k[`banner_${tone}`]}`} role={role}>{children}</p>;
}

/** Keuzeknoppen naast elkaar, bijvoorbeeld een periode. */
export function Segmented<T extends string|number>({label,options,value,onChange,format}:{label:string;options:readonly T[];value:T;onChange:(v:T)=>void;format?:(v:T)=>string}){
 return <div className={k.segmented} role="group" aria-label={label}>
  {options.map(o=><button type="button" key={String(o)} aria-pressed={o===value} onClick={()=>onChange(o)}>{format?format(o):String(o)}</button>)}
 </div>;
}

export function Kpis({children,columns=4}:{children:ReactNode;columns?:2|3|4}){
 return <div className={k.kpis} style={{['--kpi-cols' as string]:columns}}>{children}</div>;
}
/** Eén kerncijfer: label, groot getal, en een korte toelichting of verschil. */
export function Kpi({label,value,note,tone,delta}:{label:string;value:ReactNode;note?:ReactNode;tone?:'ok'|'info'|'warn'|'bad';delta?:{value:number;suffix:string}}){
 return <article className={k.kpi}>
  <span className={k.kpiLabel}>{label}</span>
  <strong className={`${k.kpiValue} ${tone?k[`text_${tone}`]:''}`}>{value}</strong>
  {delta?<span className={`${k.delta} ${delta.value>0?k.deltaUp:delta.value<0?k.deltaDown:''}`}>{delta.value>0?'+':''}{delta.value} {delta.suffix}</span>
   :note&&<small className={k.kpiNote}>{note}</small>}
 </article>;
}

export function Grid({children,columns=2}:{children:ReactNode;columns?:1|2|3}){
 return <div className={k.grid} style={{['--grid-cols' as string]:columns}}>{children}</div>;
}
/** Een paneel met titel, optionele toelichting en acties. */
export function Panel({title,id,note,actions,children}:{title:string;id:string;note?:ReactNode;actions?:ReactNode;children:ReactNode}){
 return <section className={k.panel} aria-labelledby={id}>
  <div className={k.panelHead}><div><h2 id={id}>{title}</h2>{note&&<p className={k.panelNote}>{note}</p>}</div>{actions&&<div className={k.actions}>{actions}</div>}</div>
  {children}
 </section>;
}

export function Pill({tone='neutral',children}:{tone?:Tone;children:ReactNode}){
 return <span className={`${k.pill} ${k[`pill_${tone}`]}`}>{children}</span>;
}

/** Een rij in een lijst: hoofdtekst links, meta in het midden, label of actie rechts. */
export function Row({title,sub,meta,end}:{title:ReactNode;sub?:ReactNode;meta?:ReactNode;end?:ReactNode}){
 return <li className={k.row}>
  <div className={k.rowMain}><strong>{title}</strong>{sub&&<span>{sub}</span>}</div>
  {meta!==undefined&&<span className={k.rowMeta}>{meta}</span>}
  {end&&<span className={k.rowEnd}>{end}</span>}
 </li>;
}
export function Rows({children}:{children:ReactNode}){return <ul className={k.rows}>{children}</ul>;}

/** Horizontale balken van groot naar klein (een trechter). */
export function Funnel({steps,max}:{steps:{label:string;value:number;tone?:'ok'}[];max:number}){
 return <div className={k.funnel}>{steps.map(s=><div key={s.label}>
  <div className={k.funnelHead}><span>{s.label}</span><strong>{s.value}</strong></div>
  <div className={k.track}><div className={`${k.bar} ${s.tone==='ok'?k.barOk:''}`} style={{width:`${max?Math.min(100,Math.round(s.value/max*100)):0}%`}}/></div>
 </div>)}</div>;
}

/** Grote klikbare tegel naar een andere pagina. */
export function LinkTile({href,title,sub}:{href:string;title:string;sub:string}){
 return <Link className={k.tile} href={href}><span><strong>{title}</strong><small>{sub}</small></span><span aria-hidden="true">→</span></Link>;
}

export function Empty({children}:{children:ReactNode}){return <p className={k.empty}>{children}</p>;}
export function Note({children}:{children:ReactNode}){return <p className={k.note}>{children}</p>;}

/** Uitleg die je niet elke dag hoeft te lezen: ingeklapt onderaan. */
export function Explainer({title='Hoe meten we dit?',children}:{title?:string;children:ReactNode}){
 return <details className={k.explainer}><summary>{title}</summary><div>{children}</div></details>;
}
export function Footer({children}:{children:ReactNode}){return <p className={k.footer}>{children}</p>;}

/** Standaard knop in de huisstijl; primary alleen voor de hoofdactie. */
export function Button({primary,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{primary?:boolean}){
 return <button type="button" {...props} className={`${k.button} ${primary?k.buttonPrimary:''} ${props.className??''}`}/>;
}

/** Laad-, fout- en lege toestanden op één plek. */
export function StateMessage({error,onRetry,children}:{error?:string;onRetry?:()=>void;children?:ReactNode}){
 return <div className={k.state} role={error?'alert':'status'}><p>{error??children}</p>{error&&onRetry&&<Button onClick={onRetry}>Opnieuw proberen</Button>}</div>;
}

export const kit = k;
