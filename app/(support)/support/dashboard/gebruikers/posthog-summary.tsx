'use client';
import {useEffect,useState} from 'react';
import {Panel,Button,Note} from '../../ui/kit';
type Data={status:'ready'|'not_configured';rows:{event:string;label:string;occurrences:number;identities:number}[]};
export default function PosthogSummary({token,isCurrentToken,days}:{token:string;isCurrentToken:(token:string)=>boolean;days:7|30|90}){
 const [refresh,setRefresh]=useState(0);
 const [result,setResult]=useState<{key:string;data?:Data;error?:string}>();
 const key=`${token}:${days}:${refresh}`;
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/support/posthog?days=${days}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error??'PostHog kon niet worden geladen.');return body as Data;})
   .then(data=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({key,data});})
   .catch(error=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({key,error:error instanceof Error?error.message:'Geen verbinding.'});});
  return()=>controller.abort();
 },[token,isCurrentToken,days,key]);
 const current=result?.key===key?result:undefined;
 return <Panel id="posthog" title="Gebruik en knelpunten" note={`PostHog · afgelopen ${days} dagen`}>
 {!current?<p role="status">Gebruiksgegevens laden…</p>:current.error?<p role="alert">{current.error}</p>:current.data?.status==='not_configured'?<p>PostHog is nog niet gekoppeld aan dit overzicht.</p>:<>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Gebeurtenis</th><th>Aantal</th><th>Unieke identiteiten</th></tr></thead><tbody>{current.data?.rows.map(row=><tr key={row.event}><th scope="row">{row.label}</th><td>{row.occurrences}</td><td>{row.identities}</td></tr>)}</tbody></table></div>
 {!current.data?.rows.length&&<p>Geen gebeurtenissen gevonden in deze periode.</p>}
 </>}
 <Note>PostHog meet gebeurtenissen. Identiteiten kunnen ook anonieme bezoekers of testgebruikers bevatten; dit is geen telling van leerlingaccounts. Herhaald tikken is een mogelijk knelpunt, geen bewezen fout.</Note>
 <Button onClick={()=>setRefresh(n=>n+1)}>Gebruiksgegevens vernieuwen</Button>
 </Panel>;
}
