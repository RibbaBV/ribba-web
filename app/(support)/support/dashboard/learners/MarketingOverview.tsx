'use client';
import {useEffect,useState} from 'react';
import type {MarketingSummary} from '@/lib/learner-marketing';
import styles from '../../support-design.module.css';
import local from './learners.module.css';
/** Mounted beneath the existing authenticated learner session boundary. */
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
  return <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="marketing-title">
    <p className={styles.eyebrow}>CAMPAGNEVOORBEREIDING · ALLEEN EIGENAAR</p>
    <h2 id="marketing-title">Wie wil van Ribba horen?</h2>
    <p className={styles.subtitle}>Toestemming voor e-mails met rijbewijstips, nieuwe functies en aanbiedingen. Er worden vanuit dit overzicht geen berichten verstuurd.</p>
    <label className={local.form}>Doelgroep<select value={scope} onChange={e=>setScope(e.target.value as 'all'|'none')}>
      <option value="none">Zonder schoolkoppeling</option><option value="all">Alle leerlingaccounts</option>
    </select></label>
    {!group?<div role="status"><p>{error??'Voorkeuren laden…'}</p>{error&&<button className={styles.quietButton} onClick={()=>retry(n=>n+1)}>Opnieuw proberen</button>}</div>:<>
      <div className={styles.stats}>
        <article className={styles.stat}><span>Toestemming bruikbaar</span><strong>{group.eligible}</strong><small>16+ volgens eigen profiel · hetzelfde e-mailadres</small></article>
        <article className={styles.stat}><span>Nog geen centrale keuze</span><strong>{group.not_asked}</strong><small>Alleen in de app om toestemming vragen</small></article>
        <article className={styles.stat}><span>Geen toestemming / afgemeld</span><strong>{group.declined+group.withdrawn}</strong><small>{group.declined} geweigerd · {group.withdrawn} ingetrokken</small></article>
      </div>
      <p>{group.accounts} accounts in deze doelgroep. {group.age_or_profile_blocked} kunnen zich nu niet aanmelden door een ontbrekende geboortedatum of leeftijd onder 16 jaar.</p>
      <p>{group.legacy_unconfirmed} accounts hebben alleen een oud aanvraagvinkje. Dat telt hier niet als centrale toestemming. {group.granted-group.eligible} vastgelegde toestemmingen zijn momenteel niet bruikbaar.</p>
      <p className={styles.subtitle}>Bekende testaccounts en platformmedewerkers zijn uitgesloten. Onbekende tests kunnen nog in de cijfers staan. Toestemming is geen bewijs dat een adres echt, bereikbaar of actief is.</p>
      <small>Bijgewerkt: {new Date(visible!.data!.captured_at).toLocaleString('nl-NL')}. Verzending staat uit.</small>
    </>}
  </section>;
}
