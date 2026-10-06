'use client';

import { useState } from 'react';
import Link from 'next/link';
import RibbaLogo from '../../components/RibbaLogo';
import type { School } from './school';
import styles from './support-design.module.css';

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function lastActive(iso: string | null) {
  if (!iso) return 'Nog niet actief';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'Vandaag' : days === 1 ? 'Gisteren' : `${days} dagen geleden`;
}
const subscription: Record<string, string> = { active: 'Actief', trialing: 'Proefperiode', canceled: 'Opgezegd', past_due: 'Betaling te laat', unpaid: 'Onbetaald', incomplete: 'Nog niet afgerond', incomplete_expired: 'Verlopen', paused: 'Gepauzeerd' };

export default function SchoolOverview({ scholen, fout, toonIntern, onToonIntern, onUitloggen }: {
  scholen: School[]; fout: string; toonIntern: boolean;
  onToonIntern: (value: boolean) => void; onUitloggen: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'setup'>('all');
  const query = search.trim().toLocaleLowerCase('nl');
  const visible = scholen.filter(school => (filter === 'all' || !school.onboarding_gereed)
    && `${school.school_name} ${school.city ?? ''}`.toLocaleLowerCase('nl').includes(query));
  const setup = scholen.filter(school => !school.onboarding_gereed).length;
  return <div className={styles.page}>
    <header className={styles.topbar}>
      <div className={styles.brand}><RibbaLogo height={25} /><span>Support</span></div>
      <button className={styles.quietButton} onClick={onUitloggen}>Uitloggen <span aria-hidden="true">↗</span></button>
    </header>
    <main className={styles.content}>
      <div className={styles.hero}>
        <div><p className={styles.eyebrow}>Ribba voor rijscholen</p><h1>Rijscholen</h1><p className={styles.subtitle}>Vind een rijschool en help de klant verder.</p></div>
        <span className={styles.privateNote}><span aria-hidden="true">●</span> Interne omgeving</span>
      </div>
      <div className={styles.stats} aria-label="Overzicht van de geladen rijscholen">
        <div className={styles.stat}><span>Rijscholen</span><strong>{scholen.length}</strong><small>{toonIntern ? 'Inclusief testscholen' : 'Exclusief testscholen'}</small></div>
        <div className={styles.stat}><span>Lesklaar</span><strong>{scholen.length - setup}</strong><small>Minstens één ingeschakeld lestype</small></div>
        <div className={styles.stat}><span>Lestype nodig</span><strong>{setup}</strong><small>Nog geen ingeschakeld lestype</small></div>
      </div>
      <section className={styles.schoolPanel} aria-label="Rijscholen zoeken">
        <div className={styles.toolbar}>
          <label className={styles.search}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" aria-label="Zoek op rijschool of plaats" placeholder="Zoek op rijschool of plaats" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <div className={styles.segmented} aria-label="Filter rijscholen">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Alle rijscholen</button>
            <button aria-pressed={filter === 'setup'} onClick={() => setFilter('setup')}>Lestype nodig <span>{setup}</span></button>
          </div>
        </div>
        <div className={styles.listMeta}><p role="status">{visible.length} {visible.length === 1 ? 'rijschool' : 'rijscholen'}</p><label><input type="checkbox" checked={toonIntern} onChange={e => onToonIntern(e.target.checked)} /> Testscholen tonen</label></div>
        {fout && <p className={styles.error} role="alert">{fout}</p>}
        <div className={styles.schoolList}>
          {visible.map(school => <article className={styles.schoolRow} key={school.school_id}>
            <div className={styles.rowMain}>
              <div className={styles.schoolIdentity}><span className={styles.avatar} aria-hidden="true">{school.school_name.replace(/^\[[^\]]+\]\s*/, '').replace(/^rijschool\s+/i, '').slice(0, 1).toUpperCase()}</span><div><Link href={`/support/${school.school_id}`} className={styles.schoolName}>{school.school_name}<span className={styles.stretchedChevron} aria-hidden="true">↗</span></Link><p>{school.city ?? 'Plaats niet ingevuld'}{school.is_internal && <span className={styles.internal}>Testschool</span>}</p></div></div>
              <div className={styles.rowMetric}><span>Leerlingen</span><strong>{school.leerlingen}</strong></div>
              <div className={styles.rowMetric}><span>Laatst actief</span><strong>{lastActive(school.laatste_activiteit)}</strong></div>
              <div className={styles.rowStatus}><span className={school.onboarding_gereed ? styles.badgeOk : styles.badgeAttention}>{school.onboarding_gereed ? 'Lesklaar' : 'Lestype nodig'}</span><span className={styles.subscription}>{subscription[school.abonnement_status ?? ''] ?? school.abonnement_status ?? 'Geen abonnementstatus'}</span></div>
            </div>
            <details className={styles.schoolExtra}><summary>Meer gegevens <span aria-hidden="true">⌄</span></summary><dl><div><dt>Ingeschreven</dt><dd>{date(school.created_at)}</dd></div><div><dt>Leerlingen</dt><dd>{school.leerlingen}</dd></div><div><dt>Instructeurs</dt><dd>{school.instructeurs}</dd></div><div><dt>Lestypes</dt><dd>{school.lestypes}</dd></div><div><dt>Beschikbaarheid</dt><dd>{school.beschikbaarheid}</dd></div><div><dt>Lessen</dt><dd>{school.lessen}</dd></div><div><dt>CBR-koppeling</dt><dd>{school.cbr_koppeling ?? 'Niet ingericht'}</dd></div></dl></details>
          </article>)}
          {visible.length === 0 && !fout && <div className={styles.empty}><h2>Geen rijscholen gevonden</h2><p>{search || filter !== 'all' ? 'Probeer een andere zoekterm of toon alle rijscholen.' : 'Er zijn geen rijscholen om te tonen.'}</p>{(search || filter !== 'all') && <button className={styles.quietButton} onClick={() => { setSearch(''); setFilter('all'); }}>Zoekopdracht wissen</button>}</div>}
        </div>
      </section>
      <footer className={styles.footer}>Je bekijkt schoolgegevens en aantallen, geen leerlinggegevens. Je bezoeken worden vastgelegd in het supportlogboek.</footer>
    </main>
  </div>;
}
