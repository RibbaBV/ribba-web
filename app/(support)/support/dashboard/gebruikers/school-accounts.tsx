'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Panel,Button,Note} from '../../ui/kit';
import s from './gebruikers.module.css';
const labels:Record<string,string>={all:'Alle statussen',active:'Actief',waitlist:'Wachtlijst',graduated:'Geslaagd',inactive:'Gestopt',suspended:'Geschorst'};
type School={id:string;name:string;cards:number;linked_cards:number;unlinked_cards:number;linked_accounts:number;active_today:number;online:number;statuses:{status:string;cards:number;linked_cards:number;unlinked_cards:number}[]};
type Selection={school:string;link:string;status:string;page:number};
type Cards={total:number;page:number;page_size:number;rows:{id:string;name:string;status:string;linked:boolean;presence:string|null;last_seen_at:string|null;app_version:string|null}[]};
export default function SchoolAccounts({token,isCurrentToken,refreshTrigger}:{refreshTrigger:number;token:string;isCurrentToken:(token:string)=>boolean}){
 const [schools,setSchools]=useState<School[]>();const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);const [selection,setSelection]=useState<Selection|null>(null);
 const [result,setResult]=useState<{selection:Selection;data?:Cards;error?:string}>();
 useEffect(()=>{const c=new AbortController();
 void fetch('/api/support/school-accounts',{headers:{Authorization:`Bearer ${token}`},signal:c.signal,cache:'no-store'})
 .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;})
 .then(d=>{if(!c.signal.aborted&&isCurrentToken(token)){setSchools(d.schools);setError('');}})
 .catch(e=>{if(!c.signal.aborted&&isCurrentToken(token)){setSchools(undefined);setError(e.message);}});
 return()=>c.abort();},[token,isCurrentToken,refresh,refreshTrigger]);
 useEffect(()=>{if(!selection)return;const c=new AbortController();
 void fetch('/api/support/school-accounts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(selection),signal:c.signal,cache:'no-store'})
 .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;})
 .then(data=>{if(!c.signal.aborted&&isCurrentToken(token))setResult({selection,data});})
 .catch(e=>{if(!c.signal.aborted&&isCurrentToken(token))setResult({selection,error:e.message});});
 return()=>c.abort();},[selection,token,isCurrentToken]);
 const current=result?.selection===selection?result:undefined;
 function open(school:string,link='all',status='all'){setResult(undefined);setSelection({school,link,status,page:0});}
 return <Panel id="schools" title="Leerlingadministratie per rijschool" note="Een leerlingkaart kan bestaan zonder dat de leerling een Ribba-account heeft.">
 <Button onClick={()=>setRefresh(n=>n+1)}>Schooltotalen vernieuwen</Button>
 {error?<p role="alert">{error}</p>:!schools?<p role="status">Schooltotalen laden…</p>:<div className={s.scroll}><table className={s.table}><thead><tr><th>Rijschool</th><th>Leerlingkaarten</th><th>Zonder account</th><th>Met account</th><th>Vandaag actief</th><th>Online bij meting</th></tr></thead><tbody>{schools.map(school=><tr key={school.id}><th scope="row"><Link href={`/support/${school.id}`}>{school.name}</Link><details><summary>Leerlingstatussen</summary>{school.statuses.map(row=><p key={row.status}><Button onClick={()=>open(school.id,'all',row.status)}>{labels[row.status]??row.status}: {row.cards}</Button></p>)}</details></th><td><Button onClick={()=>open(school.id)}>{school.cards}</Button></td><td><Button onClick={()=>open(school.id,'unlinked')}>{school.unlinked_cards}</Button></td><td><Button onClick={()=>open(school.id,'linked')}>{school.linked_cards}</Button><p>{school.linked_accounts} unieke accounts</p></td><td><Button onClick={()=>open(school.id,'active_today')}>{school.active_today}</Button></td><td><Button onClick={()=>open(school.id,'online')}>{school.online}</Button></td></tr>)}</tbody></table></div>}
 <Note>De eerste drie aantallen tellen leerlingkaarten, ongeacht hun status. Activiteit telt unieke accounts die nu aan de school gekoppeld zijn. De detailselectie toont hun leerlingkaarten; één account kan meerdere kaarten hebben. Online is een momentopname, elke 30 seconden bijgewerkt zolang deze pagina zichtbaar is.</Note>
 {selection&&<section aria-label="Leerlingkaarten"><h3>{schools?.find(x=>x.id===selection.school)?.name} · {selection.link==='linked'?'Met account':selection.link==='unlinked'?'Zonder account':selection.link==='online'?'Nu online':selection.link==='active_today'?'Vandaag actief':'Alle leerlingkaarten'} · {labels[selection.status]??selection.status}</h3><Button onClick={()=>{setSelection(null);setResult(undefined);}}>Leerlingkaarten sluiten</Button>
 {!current?<p role="status">Leerlingkaarten laden…</p>:current.error?<p role="alert">{current.error}</p>:<><div className={s.people}>{current.data?.rows.map(card=><article className={s.person} key={card.id}><h4>{card.name||'Naam ontbreekt'}</h4><p>Leerlingstatus: {labels[card.status]??card.status} · {card.linked?'Account gekoppeld':'Geen account gekoppeld'}</p><p>Appversie: {card.app_version??'Niet gemeten'} · Laatst gezien: {card.last_seen_at?new Date(card.last_seen_at).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'}):'Niet gemeten'}</p></article>)}</div><p>{current.data?.total} leerlingkaarten</p><Button disabled={!selection.page} onClick={()=>setSelection({...selection,page:selection.page-1})}>Vorige</Button><Button disabled={!current.data||(selection.page+1)*25>=current.data.total} onClick={()=>setSelection({...selection,page:selection.page+1})}>Volgende</Button></>}
 </section>}
 </Panel>;
}
