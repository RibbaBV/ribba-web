'use client';

// Schooldetail — waar is deze rijschool blijven steken, en wat ging er mis?
//
// Het scholenoverzicht laat zien dát iemand stilstaat. Dit scherm beantwoordt
// de vervolgvraag. De onboardingstappen komen als lijst uit de database, dus
// een stap toevoegen is een migratie en geen wijziging hier.
//
// Niveau 0: bedrijfsgegevens van de rijschool wel, namen van instructeurs en
// leerlingen niet. Zie de niveaugrens in migratie 20260803160000.
//
// Het abonnement komt uit twee bronnen die de database bewust apart houdt:
// `abonnement` is Stripe (betaald), `licentie` is Ribba zelf (waar de proef
// staat). Ze worden hier ook apart getoond. Zolang de proef nog niet via
// Stripe loopt is dat het verschil tussen "geen abonnement" en "zit nog in de
// proef" — en dat is precies het gesprek dat support voert.

import Link from 'next/link';
import type { SchoolOwners } from '@/lib/support-school-owner';
import { useEffect, useState } from 'react';
import { withCbrRecovery, type SupportEvent } from '@/lib/support-event-recovery';

interface Stap {
  sleutel: string;
  label: string;
  wanneer: string | null;
  /** Los van `wanneer`: een stap kan gedaan zijn zonder betrouwbaar tijdstip. */
  gereed: boolean;
  blokkerend: boolean;
}

interface Instructeur {
  rol: string | null;
  status: string | null;
  toegevoegd: string | null;
  account_bevestigd: string | null;
  laatste_activiteit: string | null;
}

/** De Ribba-kant van het abonnement; hier staat de proefperiode. */
interface Licentie {
  plan: string | null;
  is_proef: boolean;
  /** Ook gevuld ná een proef die is omgezet — `is_proef` bepaalt of hij nú loopt. */
  proef_tot: string | null;
  proef_verlopen: boolean;
  proef_dagen_resterend: number | null;
  gestart: string | null;
  opgezegd: string | null;
  loopt_tot: string | null;
}

export interface Detail {
  owners?: SchoolOwners | null;
  school: {
    id: string; naam: string; is_internal: boolean; status: string | null;
    aangemaakt: string; email: string | null; telefoon: string | null;
    adres: string | null; postcode: string | null; plaats: string | null;
    land: string | null; rechtsvorm: string | null; kvk: string | null;
    btw: string | null; iban_ingevuld: boolean; website: string | null;
    logo: boolean; registratie_slug: string | null; registratie_open: boolean;
    welkomstmail: string | null; plango_import: string | null;
    wizard: string | null; wizard_afgesloten: string | null;
  };
  instructeurs: Instructeur[];
  juridisch: { document: string; versie: string; wanneer: string }[];
  abonnement: { status: string; plan: string | null; gestart: string; loopt_tot: string | null } | null;
  licentie: Licentie | null;
  cbr: {
    koppeling: string | null; connectie_status: string | null; laatste_fout: string | null;
    gewijzigd: string | null; laatste: string | null; laatste_geslaagd: string | null;
    runs_7d: number; mislukt_7d: number;
  } | null;
  aantallen: Record<string, number>;
  onboarding: Stap[];
}


function moment(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function datum(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Stripe-statussen waarbij het abonnement loopt — past_due incluis: die houdt toegang. */
const STRIPE_LOOPT = ['active', 'trialing', 'past_due'];
const BETAALDE_PLANNEN = ['basic', 'premium'];

const PLAN_LABEL: Record<string, string> = {
  trial: 'proef',
  basic: 'Basic',
  premium: 'Premium',
  expired: 'verlopen',
};

function planLabel(plan: string | null): string {
  if (!plan) return '—';
  return PLAN_LABEL[plan] ?? plan;
}

function dagen(n: number): string {
  return n === 1 ? '1 dag' : `${n} dagen`;
}

/**
 * De twee bronnen horen hetzelfde te zeggen. Zeggen ze dat niet, dan is dat
 * geen weergavedetail maar een reconciliatiegat — support moet het zien
 * voordat hij iets aan de rijschool belooft.
 */
function tegenspraak(licentie: Licentie | null, abo: Detail['abonnement']): string | null {
  const licentieBetaald = BETAALDE_PLANNEN.includes(licentie?.plan ?? '');
  const stripeLoopt = abo !== null && STRIPE_LOOPT.includes(abo.status);

  if (licentieBetaald && !stripeLoopt) {
    return abo === null
      ? 'De licentie geeft een betaald plan, maar er staat geen enkel Stripe-abonnement tegenover.'
      : `De licentie geeft een betaald plan, maar het Stripe-abonnement staat op '${abo.status}'.`;
  }
  if (stripeLoopt && !licentieBetaald) {
    return `Stripe heeft een lopend abonnement, maar de licentie staat op '${planLabel(licentie?.plan ?? null)}'.`;
  }
  return null;
}

import styles from './detail-design.module.css';
import { Banner, Empty, Grid, Kpi, Kpis, Note, Page, PageHeader, Panel, Pill, Row, Rows, kit } from '../ui/kit';

const SECTIES = [['overzicht', 'Overzicht'], ['gegevens', 'Schoolgegevens'], ['account', 'Account en koppelingen'], ['activiteit', 'Gebeurtenissen']] as const;

export default function SchoolDetailView({ id, detail, events }: { id: string; detail: Detail; events: SupportEvent[] }) {
  const { school, onboarding } = detail;
  const [section, setSection] = useState('overzicht');
  useEffect(() => {
    const sync = () => { const hash = window.location.hash.slice(1); setSection(['overzicht','gegevens','account','activiteit'].includes(hash) ? hash : 'overzicht'); };
    sync(); window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [id]);
  // De eerste stap die nog niet is gezet: daar is het gesprek over.
  const gestopt = onboarding.find((stap) => !stap.gereed);

  // `?? null` en niet destructuring: dit scherm mag ook draaien tegen een
  // database waar de migratie nog niet op is toegepast. Dan is er simpelweg
  // geen licentieblok, en blijft alleen het Stripe-deel over.
  const licentie = detail.licentie ?? null;
  const conflict = tegenspraak(licentie, detail.abonnement);
  const gereed = onboarding.filter(stap => stap.gereed).length;

  return (
    <Page>
      <p className={kit.note} style={{ margin: '0 0 18px' }}><Link href="/support">← Alle rijscholen</Link></p>
      <PageHeader eyebrow="Schooldossier" title={school.naam}
        subtitle={<>{school.plaats ?? 'Plaats niet ingevuld'} · ingeschreven {datum(school.aangemaakt)}
          {detail.owners && <><br/><strong>{detail.owners.status === 'ready' && detail.owners.names.length > 1 ? 'Eigenaren' : 'Eigenaar'}:</strong> {detail.owners.status === 'unavailable' ? 'Naam tijdelijk niet beschikbaar' : detail.owners.names.join(', ') || 'Geen eigenaaraccount gekoppeld'}</>}</>}
        actions={<>{school.is_internal && <Pill tone="info">Testschool</Pill>}<Link href={`/support/${id}/bewerken`} className={`${kit.button} ${kit.buttonPrimary}`}>Schoolgegevens bewerken <span aria-hidden="true">↗</span></Link></>} />

      {licentie?.is_proef && (
        // Een proef die deze week afloopt is het eerste wat je wil weten als je
        // deze rijschool aan de lijn krijgt, dus die staat bovenaan.
        <Banner tone={licentie.proef_verlopen ? 'bad' : (licentie.proef_dagen_resterend ?? 99) <= 7 ? 'warn' : 'info'}>
          {licentie.proef_verlopen
            ? <span>Proefabonnement <strong>verlopen</strong> op {datum(licentie.proef_tot)}</span>
            : <span>Proefabonnement loopt nog <strong>{dagen(licentie.proef_dagen_resterend ?? 0)}</strong> — tot {datum(licentie.proef_tot)}</span>}
        </Banner>
      )}
      {conflict && <Banner tone="bad">{conflict}</Banner>}
      {gestopt
        ? <Banner tone="warn"><span>Eerstvolgende openstaande stap: <strong>{gestopt.label}</strong>{gestopt.blokkerend && ' — dit blokkeert het gebruik van de app'}</span></Banner>
        : !licentie?.is_proef && !conflict && <Banner tone="ok">Alle huidige instelstappen zijn voltooid.</Banner>}

      <nav className={kit.tabs} aria-label="Onderdelen van het schooldossier">
        {SECTIES.map(([key, label]) => <a key={key} href={`#${key}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); setSection(key); if (window.location.hash !== `#${key}`) window.history.pushState(null, '', `#${key}`); }} aria-current={section === key ? 'page' : undefined}>{label}</a>)}
      </nav>

      {section === 'overzicht' && <>
        <Kpis>{[['leerlingen', 'Leerlingen'], ['lessen', 'Lesrecords'], ['pakketten', 'Pakketten'], ['facturen', 'Factuurrecords']].map(([key, label]) =>
          <Kpi key={key} label={label} value={detail.aantallen?.[key]?.toLocaleString('nl-NL') ?? '—'} note="Huidige stand · geen periodemeting" />)}</Kpis>
        <Grid>
          <Panel id="aan-de-slag" title="Aan de slag" note={gestopt ? `Volgende stap: ${gestopt.label}` : 'Alle huidige instelstappen zijn voltooid.'}
            actions={<Pill tone={gestopt ? 'warn' : 'ok'}>{gereed} van {onboarding.length} stappen</Pill>}>
            <details className={styles.stappen}><summary>Alle instelstappen bekijken</summary>
              <Rows>{onboarding.map(stap => <Row key={stap.sleutel} title={stap.label}
                meta={stap.wanneer ? moment(stap.wanneer) : (stap.gereed ? 'gedaan' : '—')}
                end={<Pill tone={stap.gereed ? 'ok' : stap.blokkerend ? 'warn' : 'neutral'}>{stap.gereed ? 'Gedaan' : stap.blokkerend ? 'Blokkeert' : 'Open'}</Pill>} />)}</Rows>
            </details>
          </Panel>
          <Panel id="abonnement" title="Abonnement" note="Betaald loopt via Stripe; de proefperiode wordt op dit moment nog door Ribba zelf gezet. Twee bronnen, dus apart getoond.">
            <dl className={kit.pairs}>
              <Rij label="Ribba-licentie" waarde={licentie ? planLabel(licentie.plan) : 'geen licentie'} />
              <Rij label="Proefabonnement" waarde={
                !licentie?.is_proef ? 'nee'
                : licentie.proef_verlopen ? `verlopen op ${datum(licentie.proef_tot)}`
                : `tot ${datum(licentie.proef_tot)} · nog ${dagen(licentie.proef_dagen_resterend ?? 0)}`
              } />
              {licentie && !licentie.is_proef && licentie.proef_tot && (
                // Historie: deze rijschool ís via een proef binnengekomen.
                <Rij label="Eerdere proef liep tot" waarde={datum(licentie.proef_tot)} />
              )}
              <Rij label="Licentie gestart" waarde={licentie ? datum(licentie.gestart) : null} />
              {licentie?.opgezegd && <Rij label="Licentie opgezegd" waarde={moment(licentie.opgezegd)} />}
              {licentie?.loopt_tot && <Rij label="Licentie loopt tot" waarde={datum(licentie.loopt_tot)} />}
              <Rij label="Stripe-abonnement" waarde={detail.abonnement
                ? `${detail.abonnement.status}${detail.abonnement.plan ? ` · ${detail.abonnement.plan}` : ''}`
                : 'geen'} />
              {detail.abonnement && (
                <>
                  <Rij label="Stripe gestart" waarde={datum(detail.abonnement.gestart)} />
                  <Rij label="Periode loopt tot" waarde={datum(detail.abonnement.loopt_tot)} />
                </>
              )}
            </dl>
          </Panel>
        </Grid>
      </>}

      {section === 'gegevens' && <Panel id="schoolgegevens" title="Schoolgegevens" actions={<Link href={`/support/${id}/bewerken`}>Bewerken ↗</Link>}>
        <dl className={kit.pairs}>
          <Rij label="E-mail" waarde={school.email} />
          <Rij label="Telefoon" waarde={school.telefoon} />
          <Rij label="Adres" waarde={[school.adres, school.postcode, school.plaats].filter(Boolean).join(', ') || null} />
          <Rij label="Rechtsvorm" waarde={school.rechtsvorm} />
          <Rij label="KVK" waarde={school.kvk} />
          <Rij label="Btw" waarde={school.btw} />
          <Rij label="IBAN ingevuld" waarde={school.iban_ingevuld ? 'ja' : 'nee'} />
          <Rij label="Logo" waarde={school.logo ? 'ja' : 'nee'} />
          <Rij label="Website" waarde={school.website} />
          <Rij label="Aanmeldlink" waarde={school.registratie_slug} />
          <Rij label="Aanmelden open" waarde={school.registratie_open ? 'ja' : 'nee'} />
          <Rij label="Welkomstmail" waarde={school.welkomstmail ? moment(school.welkomstmail) : 'niet verstuurd'} />
          <Rij label="Plango-import" waarde={school.plango_import ? moment(school.plango_import) : 'nee'} />
          <Rij label="Setupwizard" waarde={
            school.wizard === 'completed' ? `afgerond · ${moment(school.wizard_afgesloten)}`
            : school.wizard === 'skipped' ? `overgeslagen · ${moment(school.wizard_afgesloten)}`
            : 'nog niet doorlopen'} />
        </dl>
      </Panel>}

      {section === 'account' && <Panel id="instructeurs" title="Instructeurs" note="Namen en e-mailadressen horen bij niveau 1 en staan hier bewust niet.">
        {detail.instructeurs.length === 0 ? <Empty>Geen instructeurs gekoppeld.</Empty> : <div className={kit.tableWrap}><table className={kit.table}>
          <thead><tr><th scope="col">Rol</th><th scope="col">Status</th><th scope="col">Bevestigd</th><th scope="col">Laatst actief</th></tr></thead>
          <tbody>{detail.instructeurs.map((i, n) => <tr key={n}><td>{i.rol ?? '—'}</td><td>{i.status ?? '—'}</td><td>{i.account_bevestigd ? 'ja' : 'nee'}</td><td>{moment(i.laatste_activiteit)}</td></tr>)}</tbody>
        </table></div>}

        <h3 className={kit.subhead}>Juridisch</h3>
        <dl className={kit.pairs}>
          {detail.juridisch.map((j) => <Rij key={j.document} label={j.document} waarde={`${j.versie} · ${datum(j.wanneer)}`} />)}
          {detail.juridisch.length === 0 && <Rij label="—" waarde="niets geaccepteerd" />}
        </dl>

        {detail.cbr && <>
          <h3 className={kit.subhead}>CBR-synchronisatie</h3>
          {detail.cbr.koppeling === 'uit' && <Banner tone="bad"><span>Koppeling staat <strong>uit</strong> sinds {moment(detail.cbr.gewijzigd)}.{detail.cbr.laatste_fout && <> Laatste fout: {detail.cbr.laatste_fout}</>} De rijschool moet hem zelf weer aanzetten via Koppelingen.</span></Banner>}
          <dl className={kit.pairs}>
            <Rij label="Koppeling" waarde={detail.cbr.koppeling} />
            <Rij label="Laatste poging" waarde={moment(detail.cbr.laatste)} />
            <Rij label="Laatst geslaagd" waarde={moment(detail.cbr.laatste_geslaagd)} />
            <Rij label="Afgelopen 7 dagen" waarde={`${detail.cbr.mislukt_7d} van ${detail.cbr.runs_7d} mislukt`} />
          </dl>
        </>}
      </Panel>}

      {section === 'activiteit' && <Panel id="gebeurtenissen" title="Gebeurtenissen" note="Facturatie, webhooks, CBR en SnelStart. Van de CBR-synchronisatie alleen de momenten waarop hij omsloeg — die draait elk uur. Een fout krijgt het label Hersteld zodra een latere geslaagde run van hetzelfde type is vastgelegd.">
        {events.length === 0 ? <Empty>Geen gebeurtenissen vastgelegd.</Empty> : <div className={kit.tableWrap}><table className={kit.table}>
          <thead><tr><th scope="col">Wanneer</th><th scope="col">Bron</th><th scope="col">Soort</th><th scope="col">Details</th></tr></thead>
          <tbody>{withCbrRecovery(events).map((e, n) => <tr key={n} className={e.ok || e.hersteldOp ? undefined : styles.fout}>
            <td className={styles.nowrap}>{moment(e.wanneer)}</td>
            <td className={styles.nowrap}>{e.bron}</td>
            <td className={styles.nowrap}>{!e.ok && <><Pill tone={e.hersteldOp ? 'ok' : 'bad'}>{e.hersteldOp ? 'Hersteld' : 'Fout'}</Pill>{' '}</>}{e.soort}</td>
            <td className={styles.detail}>{e.detail ?? '—'}{e.hersteldOp && <div className={kit.text_ok}>Hersteld op {moment(e.hersteldOp)}</div>}</td>
          </tr>)}</tbody>
        </table></div>}
      </Panel>}
      <Note>Je bekijkt schoolgegevens en aantallen, geen leerlinggegevens. Je bezoeken worden vastgelegd in het supportlogboek.</Note>
    </Page>
  );
}

function Rij({ label, waarde }: { label: string; waarde: string | null }) {
  return <><dt>{label}</dt><dd>{waarde ?? '—'}</dd></>;
}
