'use client';
// Tegoedlogboek (stap 3, 12 nov 2026): per leerling zien wanneer en waardoor
// een tegoedpotje veranderde. Alleen de eigenaar; elke inzage wordt gelogd.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSupportToken} from '../../client';
import {doorLabel,hoeveelheid,oorzaakLabel,verschil,type TegoedLogboek,type TegoedPotje,type TegoedRegel,type TegoedZoekRij} from '@/lib/tegoed-logboek';
import styles from '../../support-design.module.css';
import local from './tegoed.module.css';

const tijd=(v:string)=>new Date(v).toLocaleString('nl-NL',{dateStyle:'medium',timeStyle:'short'});
const datum=(v:string)=>new Date(`${v}T12:00:00`).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short',year:'numeric'});

export default function TegoedPage(){
 const {token,status,isCurrentToken}=useSupportToken();
 return <main className={styles.page}><div className={styles.content}>
  <header className={styles.hero}><div><p className={styles.eyebrow}>RIBBA · ALLEEN EIGENAAR</p><h1>Tegoedlogboek.</h1><p className={styles.subtitle}>Zie per leerling wanneer en waardoor een tegoedpotje veranderde: lessen, betalingen en handmatige aanpassingen.</p></div></header>
  {token?<Tegoed token={token} isCurrentToken={isCurrentToken}/>:status==='laden'?<p role="status">Sessie controleren…</p>:<div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je eigenaaraccount en tweefactor om het logboek te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>}
 </div></main>;
}

type Verzoek={token:string;body:Record<string,string>};
type Antwoord<T>={verzoek:Verzoek;data?:T;error?:string};

/** Eén POST; het antwoord hoort altijd bij precies dit verzoek en dit token. */
function usePost<T>(verzoek:Verzoek|null,token:string,isCurrentToken:(t:string)=>boolean){
 const [antwoord,setAntwoord]=useState<Antwoord<T>|null>(null);
 useEffect(()=>{
  if(!verzoek||verzoek.token!==token)return;
  const controller=new AbortController();
  void fetch('/api/support/dashboard/tegoed',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(verzoek.body),cache:'no-store',signal:controller.signal})
   .then(async res=>({res,body:await res.json()})).then(({res,body})=>{if(!controller.signal.aborted&&isCurrentToken(token))setAntwoord({verzoek,...(res.ok?{data:body as T}:{error:body.error??'Laden mislukt.'})});})
   .catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setAntwoord({verzoek,error:'Geen verbinding. Probeer opnieuw.'});});
  return()=>controller.abort();
 },[verzoek,token,isCurrentToken]);
 const huidig=verzoek&&antwoord?.verzoek===verzoek?antwoord:null;
 return {huidig,laden:!!verzoek&&verzoek.token===token&&!huidig};
}

function Tegoed({token,isCurrentToken}:{token:string;isCurrentToken:(t:string)=>boolean}){
 const [query,setQuery]=useState('');const [reason,setReason]=useState('');
 const [zoek,setZoek]=useState<Verzoek|null>(null);
 const [boek,setBoek]=useState<Verzoek|null>(null);
 const z=usePost<TegoedZoekRij[]>(zoek,token,isCurrentToken);
 const b=usePost<TegoedLogboek>(boek,token,isCurrentToken);
 const redenOk=reason.trim().length>=10;
 const open=(id:string)=>setBoek({token,body:{modus:'logboek',student_id:id,reason:reason.trim()}});

 if(boek)return <Logboek antwoord={b.huidig} laden={b.laden} terug={()=>setBoek(null)} opnieuw={()=>setBoek({...boek})}/>;

 return <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="zoek-title"><h2 id="zoek-title">Leerling zoeken</h2>
  <p className={styles.subtitle}>Naam, e-mailadres en tegoed zijn persoonsgegevens. Geef aan waarom je kijkt; elke zoekopdracht en elk geopend logboek wordt vastgelegd. Zet geen leerlinggegevens in de reden.</p>
  <form className={local.form} onSubmit={e=>{e.preventDefault();setZoek({token,body:{modus:'zoek',query:query.trim(),reason:reason.trim()}});}}>
   <label>Naam of e-mailadres<input value={query} onChange={e=>setQuery(e.target.value)} minLength={2} maxLength={100} required autoComplete="off"/></label>
   <label className={local.reason}>Reden voor inzage<input value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={300} required placeholder="Bijvoorbeeld: nagaan waarom een potje negatief staat" autoComplete="off"/></label>
   <button className={styles.quietButton} disabled={!redenOk||query.trim().length<2||z.laden}>{z.laden?'Zoeken…':'Zoeken'}</button>
  </form>
  {z.huidig?.error&&<p role="alert" className={styles.error}>{z.huidig.error}</p>}
  {z.huidig?.data&&(z.huidig.data.length===0?<p className={styles.empty}>Geen leerlingen gevonden.</p>:<div className={local.rows}>
   {z.huidig.data.length===20&&<p className={styles.subtitle}>De eerste 20 treffers. Maak de zoekterm specifieker als de leerling er niet bij staat.</p>}
   {z.huidig.data.map(r=><article className={local.row} key={r.student_id}>
    <div><h3>{r.naam||'Naam onbekend'}</h3><p>{r.email??'Geen e-mailadres'}</p></div>
    <div><p><Link href={`/support/${r.school_id}`}>{r.school}</Link></p><small>{r.potjes} {r.potjes===1?'potje':'potjes'} · {r.logregels} {r.logregels===1?'logregel':'logregels'}</small></div>
    <div><button className={styles.quietButton} disabled={!redenOk} onClick={()=>open(r.student_id)}>Logboek bekijken</button></div>
   </article>)}
  </div>)}
 </section>;
}

function Logboek({antwoord,laden,terug,opnieuw}:{antwoord:Antwoord<TegoedLogboek>|null;laden:boolean;terug:()=>void;opnieuw:()=>void}){
 const [filter,setFilter]=useState('alle');
 const data=antwoord?.data;
 const terugKnop=<button className={styles.quietButton} onClick={terug}>← Terug naar zoeken</button>;
 if(laden||!antwoord)return <section className={`${styles.schoolPanel} ${local.panel}`}>{terugKnop}<p role="status">Logboek laden…</p></section>;
 if(!data)return <section className={`${styles.schoolPanel} ${local.panel}`}>{terugKnop}<p role="alert" className={styles.error}>{antwoord.error}</p><button className={styles.quietButton} onClick={opnieuw}>Opnieuw proberen</button></section>;
 const potjes=new Map(data.potjes.map(p=>[p.bucket_id,p]));
 const regels=filter==='alle'?data.regels:data.regels.filter(r=>r.bucket_id===filter);
 return <>
  <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="leerling-title">
   {terugKnop}
   <h2 id="leerling-title" className={local.naam}>{data.leerling.naam||'Naam onbekend'}</h2>
   <p className={styles.subtitle}>{data.leerling.email??'Geen e-mailadres'} · <Link href={`/support/${data.leerling.school_id}`}>{data.leerling.school}</Link></p>
   <h3 className={local.kop}>Potjes nu</h3>
   {data.potjes.length===0?<p className={styles.empty}>Deze leerling heeft geen potjes.</p>:<div className={local.potjes}>{data.potjes.map(p=><Potje key={p.bucket_id} p={p}/>)}</div>}
  </section>
  <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="regels-title">
   <h2 id="regels-title">Wijzigingen</h2>
   <p className={styles.subtitle}>Nieuwste bovenaan. Het logboek loopt sinds {data.logboek_sinds?tijd(data.logboek_sinds):'11 nov 2026'}; wat daarvóór gebeurde staat er niet in.{data.totaal>data.regels.length?` De laatste ${data.regels.length} van ${data.totaal} wijzigingen.`:''}</p>
   {data.potjes.length>1&&<label className={local.filter}>Potje<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="alle">Alle potjes</option>{data.potjes.map(p=><option key={p.bucket_id} value={p.bucket_id}>{p.potje}</option>)}</select></label>}
   {regels.length===0?<p className={styles.empty}>Nog geen wijzigingen vastgelegd.</p>:<ol className={local.regels}>{regels.map(r=><Regel key={r.id} r={r} p={potjes.get(r.bucket_id)}/>)}</ol>}
  </section>
 </>;
}

function Potje({p}:{p:TegoedPotje}){
 const h=(m:number)=>hoeveelheid(m,p.eenheid,p.per_eenheid);
 return <article className={local.potje} data-negatief={p.vrij<0||undefined}><span>{p.potje}</span><strong>{h(p.vrij)}</strong><small>vrij</small>
  <dl><div><dt>Gepland</dt><dd>{h(p.gepland)}</dd></div><div><dt>Gebruikt</dt><dd>{h(p.gebruikt)}</dd></div><div><dt>Gekocht</dt><dd>{h(p.gekocht)}</dd></div></dl></article>;
}

function Stand({label,voor,na,eenheid,per}:{label:string;voor:number|null;na:number|null;eenheid:string;per:number|null}){
 const d=verschil(voor,na);
 if(d===null)return null;
 return <span className={local.stand}><b>{label}</b> {hoeveelheid(voor,eenheid,per)} → {hoeveelheid(na,eenheid,per)} <em data-plus={d>0||undefined}>{d>0?'+':''}{hoeveelheid(d,eenheid,per)}</em></span>;
}

function Regel({r,p}:{r:TegoedRegel;p?:TegoedPotje}){
 const per=p?.per_eenheid??null;
 const wat=r.actie==='aangemaakt'?`Potje aangemaakt · ${oorzaakLabel(r.oorzaak)}`:r.actie==='verwijderd'?`Potje verwijderd · ${oorzaakLabel(r.oorzaak)}`:oorzaakLabel(r.oorzaak);
 return <li className={local.regel}>
  <time dateTime={r.tijd}>{tijd(r.tijd)}</time>
  <div>
   <p className={local.wat}><b>{wat}</b> <span className={local.potjeNaam}>{r.potje}</span></p>
   {r.actie==='gewijzigd'?<p className={local.standen}>
    <Stand label="Vrij" voor={r.vrij_voor} na={r.vrij_na} eenheid={r.eenheid} per={per}/>
    <Stand label="Gepland" voor={r.gepland_voor} na={r.gepland_na} eenheid={r.eenheid} per={per}/>
    <Stand label="Gebruikt" voor={r.gebruikt_voor} na={r.gebruikt_na} eenheid={r.eenheid} per={per}/>
    <Stand label="Gekocht" voor={r.gekocht_voor} na={r.gekocht_na} eenheid={r.eenheid} per={per}/>
   </p>:<p className={local.standen}><span className={local.stand}><b>Vrij</b> {hoeveelheid(r.actie==='aangemaakt'?r.vrij_na:r.vrij_voor,r.eenheid,per)}</span></p>}
   <p className={local.meta}>
    {r.les&&<span>Les van {datum(r.les.datum)}{r.les.start?` om ${r.les.start.slice(0,5)}`:''}{r.les.duur?` · ${r.les.duur} min`:''}</span>}
    {!r.les&&r.les_id&&<span>Les bestaat niet meer</span>}
    <span>Door: {doorLabel(r)}</span>
    {r.reden&&<span>Reden: {r.reden}</span>}
    {r.route&&<span className={local.route}>{r.route}</span>}
   </p>
  </div>
 </li>;
}
