'use client';
import {useEffect,useState} from 'react';
import type {MarketingSummary} from '@/lib/learner-marketing';
import k from '../../ui/kit.module.css';
/** Mounted beneath the existing authenticated learner session boundary.
 *  Gewone HTML met de huisstijlklassen (geen kit-componenten), zodat de test dit paneel los kan renderen. */
export default function MarketingOverview({token,isCurrentToken}:{token:string;isCurrentToken:(token:string)=>boolean}) {
  const [attempt,retry]=useState(0);
  const [result,setResult]=useState<{token:string;data?:MarketingSummary;error?:string}|null>(null);
  const [scope,setScope]=useState<'all'|'none'>('none');
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/support/dashboard/marketing',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>({response,body:await response.json()})).then(({response,body})=>{
        if(!controller.signal.aborted&&isCurrentToken(token))setResult({token,...(response.ok?{data:body}:{error:body.error??'Laden mislukt.'})});
      }).catch(()=>{if(!controller.signal.aborted&&isCurrentToken(token))setResult({token,error:'Geen verbinding. Probeer opnieuw.'});});
    return()=>controller.abort();
  },[token,isCurrentToken,attempt]);
  const visible=result?.token===token?result:null;
  const group=visible?.data?.groups?.find(g=>g.scope===scope);
  const error=visible?.error??(visible?.data&&!group?'De gekozen doelgroep ontbreekt in het antwoord. Probeer opnieuw.':null);
  return <section className={k.panel} aria-labelledby="marketing-title">
    <div className={k.panelHead}><div><h2 id="marketing-title">Wie wil van Ribba horen?</h2><p className={k.panelNote}>Toestemming voor e-mails met rijbewijstips, nieuwe functies en aanbiedingen. Vanuit dit overzicht worden geen berichten verstuurd.</p></div>
    <label className={k.inlineField}>Doelgroep<select value={scope} onChange={e=>setScope(e.target.value as 'all'|'none')}>
      <option value="none">Zonder schoolkoppeling</option><option value="all">Alle leerlingaccounts</option>
    </select></label></div>
    {!group?<div className={k.state} role="status"><p>{error??'Voorkeuren laden…'}</p>{error&&<button type="button" className={k.button} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>:<>
      <dl className={k.facts}>
        <div><dt>Toestemming bruikbaar</dt><dd className={k.bigFact}>{group.eligible}</dd><dd className={k.factNote}>16+ volgens eigen profiel · hetzelfde e-mailadres</dd></div>
        <div><dt>Nog geen centrale keuze</dt><dd className={k.bigFact}>{group.not_asked}</dd><dd className={k.factNote}>Alleen in de app om toestemming vragen</dd></div>
        <div><dt>Geen toestemming / afgemeld</dt><dd className={k.bigFact}>{group.declined+group.withdrawn}</dd><dd className={k.factNote}>{group.declined} geweigerd · {group.withdrawn} ingetrokken</dd></div>
      </dl>
      <div className={k.prose}>
      <p className={k.note}>{group.accounts} accounts in deze doelgroep. {group.age_or_profile_blocked} kunnen zich nu niet aanmelden, bijvoorbeeld door een ontbrekende geboortedatum, een leeftijd onder 16 jaar of een account zonder bruikbaar e-mailadres.</p>
      <p>{group.legacy_unconfirmed} accounts hebben alleen een oud aanvraagvinkje. Dat telt hier niet als centrale toestemming. {group.granted-group.eligible} vastgelegde toestemmingen zijn momenteel niet bruikbaar.</p>
      <p>Bekende testaccounts en platformmedewerkers zijn uitgesloten. Onbekende tests kunnen nog in de cijfers staan. Toestemming is geen bewijs dat een adres echt, bereikbaar of actief is.</p>
      <p>Bijgewerkt: {new Date(visible!.data!.captured_at).toLocaleString('nl-NL')}. Verzending staat uit.</p>
      </div>
    </>}
  </section>;
}
