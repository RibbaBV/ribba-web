'use client';
// /support/gebruik — "Gebruik van de app" (10 nov 2026).
//
// Toont alleen aantallen uit app_events: actieve gebruikers, schermen, knoppen
// en de plannen-trechter. Nooit wie wat deed. Zie lib/app-gebruik.ts en
// app/api/support/gebruik/route.ts.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupportToken } from '../client';
import {
  periodes, rolLabel, schermLabel, knopLabel, procent, gebruikersPerDag,
  type AppGebruik, type Periode,
} from '@/lib/app-gebruik';
import styles from '../support-design.module.css';
import local from './gebruik.module.css';

export default function GebruikPage() {
  const { token, isCurrentToken } = useSupportToken();
  return <main className={styles.page}><div className={styles.content}>
    <p><Link href="/support" style={{ color: 'var(--support-link, #a8ceff)' }}>← Rijscholen</Link></p>
    <header className={styles.hero}><div>
      <p className={styles.eyebrow}>RIBBA · SUPPORT</p>
      <h1>Gebruik van de app.</h1>
      <p className={styles.subtitle}>Welke schermen worden geopend en waarop wordt getikt. Alleen aantallen — nooit wie wat deed.</p>
    </div></header>
    {token ? <Gebruik token={token} isCurrentToken={isCurrentToken} /> : <p>Log in met je supportaccount en tweefactor om dit overzicht te openen.</p>}
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
      <div className={styles.stats}>
        <article className={styles.stat}><span>Actieve gebruikers · {d.dagen} dagen</span><strong>{d.totaal.gebruikers}</strong>
          <small>{d.per_rol.map(r => `${r.gebruikers} ${rolLabel(r.rol).toLowerCase()}`).join(' · ') || 'Nog geen gegevens'}</small></article>
        <article className={styles.stat}><span>Les plannen · leerlingen</span><strong>{procent(d.trechter_les.planscherm, d.trechter_les.gezien)}</strong>
          <small>{d.trechter_les.gezien} zagen Home of Praktijk → {d.trechter_les.tikte} tikten op Les plannen → {d.trechter_les.planscherm} bereikten het planscherm</small></article>
        <article className={styles.stat}><span>Proefles plannen</span><strong>{d.trechter_proefles.tikte}</strong>
          <small>tikten op Proefles plannen · {d.trechter_proefles.planscherm} bereikten het planscherm</small></article>
      </div>

      <section className={`${styles.schoolPanel} ${local.panel}`} aria-labelledby="dag-titel">
        <h2 id="dag-titel">Actieve gebruikers per dag</h2>
        <Grafiek rijen={gebruikersPerDag(d.per_dag)} />
      </section>

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
        <p>De trechter telt leerlingen, niet tikken: &ldquo;bereikten het planscherm&rdquo; betekent dat dezelfde leerling ná het tikken het planscherm opende. Of er daarna echt een les is aangevraagd, staat bij de rijschool.</p>
      </details>
    </>}
  </>;
}

function Grafiek({ rijen }: { rijen: { dag: string; gebruikers: number }[] }) {
  if (rijen.length === 0) return <p className={styles.subtitle}>Nog geen gegevens in deze periode.</p>;
  const max = Math.max(1, ...rijen.map(r => r.gebruikers));
  return <>
    <div className={local.grafiek} role="img" aria-label={`Actieve gebruikers per dag; hoogste ${max}. De cijfers staan onder Dagcijfers.`}>
      {rijen.map(r => <div key={r.dag} title={`${r.dag}: ${r.gebruikers}`} style={{ height: `${Math.max(3, (r.gebruikers / max) * 100)}%` }} />)}
    </div>
    <details><summary>Dagcijfers bekijken</summary><div className={local.dagen}>{rijen.map(r => <span key={r.dag}>{r.dag}: <b>{r.gebruikers}</b></span>)}</div></details>
  </>;
}

function Tabel({ kop, rijen }: { kop: string[]; rijen: (string | number)[][] }) {
  if (rijen.length === 0) return <p className={styles.subtitle}>Nog geen gegevens in deze periode.</p>;
  return <div className={local.tabelWrap}><table className={local.tabel}>
    <thead><tr>{kop.map(k => <th key={k} scope="col">{k}</th>)}</tr></thead>
    <tbody>{rijen.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? local.getal : undefined}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}
