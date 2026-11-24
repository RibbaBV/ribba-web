'use client';

import { useState } from 'react';
import Link from 'next/link';
import RibbaLogo from '../../components/RibbaLogo';
import OwnerDashboardLink from './owner-dashboard-link';
import type { School } from './school';
import styles from './support-design.module.css';
import local from './school-overview.module.css';
import { Button, Empty, Footer, Kpi, Kpis, Page, PageHeader, Panel, Pill, Segmented, kit } from './ui/kit';

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
    {/* Topbalk voor medewerkers zonder zijmenu; binnen het eigenaarsmenu blijft alleen Uitloggen zichtbaar. */}
    <header className={styles.topbar} data-support-overview-actions>
      <div className={styles.brand}><RibbaLogo height={25} /><span>Support</span></div>
      <Link href="/support/gebruik" style={{ color: 'var(--support-link, #a8ceff)' }}>Gebruik van de app</Link>
      <OwnerDashboardLink />
      <button className={styles.quietButton} onClick={onUitloggen}>Uitloggen <span aria-hidden="true">↗</span></button>
    </header>
    <Page>
      <PageHeader eyebrow="Ribba voor rijscholen · interne omgeving" title="Rijscholen." subtitle="Vind een rijschool en help de klant verder. Leerlingkaarten kunnen ook leerlingen zonder loginaccount bevatten." />
      <Kpis columns={3}>
        <Kpi label="Rijscholen" value={scholen.length} note={toonIntern ? 'Inclusief testscholen' : 'Exclusief testscholen'} />
        <Kpi label="Lesklaar" value={scholen.length - setup} tone="ok" note="Minstens één ingeschakeld lestype" />
        <Kpi label="Lestype nodig" value={setup} tone={setup > 0 ? 'warn' : undefined} note="Nog geen ingeschakeld lestype" />
      </Kpis>
      <Panel id="rijscholen-zoeken" title="Alle rijscholen" note={`${visible.length} ${visible.length === 1 ? 'rijschool' : 'rijscholen'} in deze lijst`}
        actions={<label className={kit.inlineField}><input type="checkbox" checked={toonIntern} onChange={e => onToonIntern(e.target.checked)} /> Testscholen tonen</label>}>
        <div className={local.toolbar}>
          <label className={local.search}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" aria-label="Zoek op rijschool of plaats" placeholder="Zoek op rijschool of plaats" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <Segmented label="Filter rijscholen" options={['all', 'setup'] as const} value={filter} onChange={setFilter} format={v => v === 'all' ? 'Alle rijscholen' : `Lestype nodig · ${setup}`} />
        </div>
        <p role="status" className={local.srOnly}>{visible.length} {visible.length === 1 ? 'rijschool' : 'rijscholen'}</p>
        {fout && <p className={kit.text_bad} role="alert">{fout}</p>}
        <ul className={local.list}>
          {visible.map(school => <li className={local.school} key={school.school_id}>
            <div className={local.main}>
              <div className={local.identity}><span className={local.avatar} aria-hidden="true">{school.school_name.replace(/^\[[^\]]+\]\s*/, '').replace(/^rijschool\s+/i, '').slice(0, 1).toUpperCase()}</span><div><Link href={`/support/${school.school_id}`} className={local.name}>{school.school_name} <span aria-hidden="true">↗</span></Link><p>{school.city ?? 'Plaats niet ingevuld'}{school.is_internal && <Pill tone="info">Testschool</Pill>}</p></div></div>
              <div className={local.metric}><span>Leerlingkaarten</span><strong>{school.leerlingen}</strong></div>
              <div className={local.metric}><span>Laatste sessie of lesregistratie</span><strong>{lastActive(school.laatste_activiteit)}</strong></div>
              <div className={local.status}><Pill tone={school.onboarding_gereed ? 'ok' : 'warn'}>{school.onboarding_gereed ? 'Lesklaar' : 'Lestype nodig'}</Pill><small>{subscription[school.abonnement_status ?? ''] ?? school.abonnement_status ?? 'Geen abonnementstatus'}</small></div>
            </div>
            <details className={local.extra}><summary>Meer gegevens</summary><dl className={kit.facts}><div><dt>Ingeschreven</dt><dd>{date(school.created_at)}</dd></div><div><dt>Leerlingkaarten</dt><dd>{school.leerlingen}</dd></div><div><dt>Instructeurs</dt><dd>{school.instructeurs}</dd></div><div><dt>Lestypes</dt><dd>{school.lestypes}</dd></div><div><dt>Beschikbaarheid</dt><dd>{school.beschikbaarheid}</dd></div><div><dt>Lessen</dt><dd>{school.lessen}</dd></div><div><dt>CBR-koppeling</dt><dd>{school.cbr_koppeling ?? 'Niet ingericht'}</dd></div></dl></details>
          </li>)}
        </ul>
        {visible.length === 0 && !fout && <><Empty>{search || filter !== 'all' ? 'Geen rijscholen gevonden. Probeer een andere zoekterm of toon alle rijscholen.' : 'Er zijn geen rijscholen om te tonen.'}</Empty>{(search || filter !== 'all') && <Button onClick={() => { setSearch(''); setFilter('all'); }}>Zoekopdracht wissen</Button>}</>}
      </Panel>
      <Footer>Je bekijkt schoolgegevens en aantallen, geen leerlinggegevens. Je bezoeken worden vastgelegd in het supportlogboek.</Footer>
    </Page>
  </div>;
}
