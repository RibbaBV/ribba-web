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
import { Empty, Page, PageHeader, Segmented, StateMessage, kit } from '../ui/kit';
import local from './gebruik.module.css';

export default function GebruikPage() {
  const { token, status, isCurrentToken } = useSupportToken();
  return <Page>
    <PageHeader eyebrow="Ribba · support" title="Groei en conversie." subtitle="Onderzoek waar gebruikers afhaken en of ze terugkomen. Voor aantallen, nieuwe accounts en online-status ga je naar Gebruikers." />
    {token ? <><ConversieDashboard token={token} isCurrentToken={isCurrentToken} /><details className={`${kit.panel} ${local.raw}`}><summary>Ruwe appgebruikcijfers bekijken</summary><Gebruik token={token} isCurrentToken={isCurrentToken} /></details></>
      : status === 'laden' ? <p role="status">Sessie controleren…</p>
      : <div className={kit.state}><p>Je supportsessie is verlopen of je bent niet ingelogd. Log in met je supportaccount en tweefactor om dit overzicht te openen.</p><Link href="/support" className={styles.quietButton}>Inloggen</Link></div>}
  </Page>;
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
    <div className={local.keuze}>
      <Segmented label="Periode" options={periodes} value={dagen} onChange={setDagen} format={p => `${p} dagen`} />
      <label className={kit.inlineField}><input type="checkbox" checked={intern} onChange={e => setIntern(e.target.checked)} /> Test- en pilotscholen meetellen</label>
    </div>

    {!d ? <StateMessage error={zichtbaar?.fout} onRetry={() => opnieuw(n => n + 1)}>Gebruik laden…</StateMessage> : <>
      <p className={kit.note}>{d.totaal.gebeurtenissen.toLocaleString('nl-NL')} events van {d.totaal.gebruikers} unieke gebruikers in {d.dagen} dagen. Scherm- en knopgebruik is diagnostiek, geen voltooide conversie.</p>

      <section className={local.block} aria-labelledby="scherm-titel">
        <h3 id="scherm-titel">Meest geopende schermen</h3>
        <Tabel kop={['Scherm', 'Rol', 'Keer geopend', 'Door gebruikers']}
          rijen={d.schermen.map(s => [schermLabel(s.scherm), rolLabel(s.rol), s.keer, s.gebruikers])} />
      </section>

      <section className={local.block} aria-labelledby="knop-titel">
        <h3 id="knop-titel">Meest getikte knoppen</h3>
        <Tabel kop={['Knop', 'Op scherm', 'Rol', 'Keer getikt', 'Door gebruikers']}
          rijen={d.knoppen.map(k => [knopLabel(k.element).naam, schermLabel(k.scherm), rolLabel(k.rol), k.keer, k.gebruikers])} />
      </section>

      <details className={kit.explainer}><summary>Wat meten we precies?</summary>
        <p>De app legt vast welk scherm iemand opent en op welke knop hij tikt, met rol, toestel en app-versie. Wat iemand intypt wordt nooit vastgelegd. Knoppen heten naar hun vaste naam in de app (bijvoorbeeld <code>home-les-plannen</code>) of naar de vertaalsleutel van hun tekst; zonder vaste naam staat er &ldquo;Knop zonder vaste naam&rdquo;.</p>
        <p>Proeven vanuit de ontwikkelversie tellen nooit mee. Test- en pilotscholen alleen als je dat hierboven aanzet. Gegevens worden na 90 dagen automatisch verwijderd.</p>
        <p>Dit detailoverzicht bevat losse scherm- en knoptellingen. De conversiegrafieken hierboven volgen startcohorten in ontvangstvolgorde. Of er werkelijk een les is aangevraagd, vereist een bevestigde businessgebeurtenis.</p>
      </details>
    </>}
  </>;
}

function Tabel({ kop, rijen }: { kop: string[]; rijen: (string | number)[][] }) {
  if (rijen.length === 0) return <Empty>Nog geen gegevens in deze periode.</Empty>;
  return <div className={kit.tableWrap}><table className={kit.table}>
    <thead><tr>{kop.map(k => <th key={k} scope="col">{k}</th>)}</tr></thead>
    <tbody>{rijen.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? kit.num : undefined}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}
