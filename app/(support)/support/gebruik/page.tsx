'use client';
// /support/gebruik — "Gebruik van de app" (10 nov 2026).
//
// Toont alleen aantallen uit app_events: actieve gebruikers, schermen, knoppen
// en de plannen-trechter. Nooit wie wat deed. Zie lib/app-gebruik.ts en
// app/api/support/gebruik/route.ts.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ConversieDashboard from './conversie-dashboard';
import { useSupportToken } from '../client';
import {
  periodes, rolLabel, schermLabel, knopLabel,
  type AppGebruik, type Periode,
} from '@/lib/app-gebruik';
import styles from '../support-design.module.css';
import local from './gebruik.module.css';

export default function GebruikPage() {
  const { token, status, isCurrentToken } = useSupportToken();
  return <main className={styles.page}><div className={styles.content}>
    <p><Link href="/support" style={{ color: 'var(--support-link, #a8ceff)' }}>← Rijscholen</Link></p>
    <header className={styles.hero}><div>
      <p className={styles.eyebrow}>RIBBA · SUPPORT</p>
      <h1>Conversies en groei.</h1>
      <p className={styles.subtitle}>Van eerste gebruik naar terugkeer, doorverwijzing en betaling. Dagelijkse PIRAAT-trends, met een teller, noemer en eerlijke meetdekking.</p>
    </div></header>
    {token ? <><ConversieDashboard token={token} isCurrentToken={isCurrentToken} /><details className={local.panel}><summary>Ruwe appgebruikcijfers bekijken</summary><Gebruik token={token} isCurrentToken={isCurrentToken} /></details></>
      : status === 'laden' ? <p role="status">Sessie controleren…</p>
      : <div><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je supportaccount en tweefactor om dit overzicht te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>}
  </div></main>;
}

function Gebruik({ token, isCurrentToken }: { token: string; isCurrentToken: (t: string) => boolean }) {
  const [dagen, setDagen] = useState<Periode>(30);
  const [intern, setIntern] = useState(false);
  const [poging, opnieuw] = useState(0);
  const [stand, setStand] = useState<{ sleutel: string; data?: AppGebruik; fout?: string } | null>(null);
  const sleutel = `${token}|${dagen}|${intern}|${poging}`;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/support/gebruik?dagen=${dagen}${intern ? '&intern=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
    }).then(async res => ({ res, body: await res.json() })).then(({ res, body }) => {
      if (!controller.signal.aborted && isCurrentToken(token)) setStand({ sleutel, ...(res.ok ? { data: body } : { fout: body.error ?? 'Laden mislukt.' }) });
    }).catch(() => {
      if (!controller.signal.aborted && isCurrentToken(token)) setStand({ sleutel, fout: 'Geen verbinding. Probeer opnieuw.' });
    });
    return () => controller.abort();
  }, [token, dagen, intern, poging, sleutel, isCurrentToken]);

  const zichtbaar = stand?.sleutel === sleutel ? stand : null;
  const d = zichtbaar?.data;

  return <>
    <div className={local.keuze} role="group" aria-label="Periode">
      {periodes.map(p => <button key={p} className={styles.quietButton} aria-pressed={dagen === p} onClick={() => setDagen(p)}>{p} dagen</button>)}
      <label className={local.intern}><input type="checkbox" checked={intern} onChange={e => setIntern(e.target.checked)} /> Test- en pilotscholen meetellen</label>
    </div>

    {!d ? <div role="status"><p>{zichtbaar?.fout ?? 'Gebruik laden…'}</p>{zichtbaar?.fout && <button className={styles.quietButton} onClick={() => opnieuw(n => n + 1)}>Opnieuw proberen</button>}</div> : <>
      <p className={styles.subtitle}>{d.totaal.gebeurtenissen.toLocaleString('nl-NL')} events van {d.totaal.gebruikers} unieke gebruikers in {d.dagen} dagen. Scherm- en knopgebruik is diagnostiek, geen voltooide conversie.</p>

      <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="scherm-titel">
        <h2 id="scherm-titel">Meest geopende schermen</h2>
        <Tabel kop={['Scherm', 'Rol', 'Keer geopend', 'Door gebruikers']}
          rijen={d.schermen.map(s => [schermLabel(s.scherm), rolLabel(s.rol), s.keer, s.gebruikers])} />
      </section>

      <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="knop-titel">
        <h2 id="knop-titel">Meest getikte knoppen</h2>
        <Tabel kop={['Knop', 'Op scherm', 'Rol', 'Keer getikt', 'Door gebruikers']}
          rijen={d.knoppen.map(k => [knopLabel(k.element).naam, schermLabel(k.scherm), rolLabel(k.rol), k.keer, k.gebruikers])} />
      </section>

      <details className={`${styles.schoolPanel} ${local.panel}`}><summary>Wat meten we precies?</summary>
        <p>De app legt vast welk scherm iemand opent en op welke knop hij tikt, met rol, toestel en app-versie. Wat iemand intypt wordt nooit vastgelegd. Knoppen heten naar hun vaste naam in de app (bijvoorbeeld <code>home-les-plannen</code>) of naar de vertaalsleutel van hun tekst; zonder vaste naam staat er &ldquo;Knop zonder vaste naam&rdquo;.</p>
        <p>Proeven vanuit de ontwikkelversie tellen nooit mee. Test- en pilotscholen alleen als je dat hierboven aanzet. Gegevens worden na 90 dagen automatisch verwijderd.</p>
        <p>Dit detailoverzicht bevat losse scherm- en knoptellingen. De conversiegrafieken hierboven volgen startcohorten in ontvangstvolgorde. Of er werkelijk een les is aangevraagd, vereist een bevestigde businessgebeurtenis.</p>
      </details>
    </>}
  </>;
}

function Tabel({ kop, rijen }: { kop: string[]; rijen: (string | number)[][] }) {
  if (rijen.length === 0) return <p className={styles.subtitle}>Nog geen gegevens in deze periode.</p>;
  return <div className={local.tabelWrap}><table className={local.tabel}>
    <thead><tr>{kop.map(k => <th key={k} scope="col">{k}</th>)}</tr></thead>
    <tbody>{rijen.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? local.getal : undefined}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}
