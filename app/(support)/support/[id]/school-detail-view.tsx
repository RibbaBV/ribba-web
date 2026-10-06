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
import RibbaLogo from '../../../components/RibbaLogo';

export default function SchoolDetailView({ id, detail, events }: { id: string; detail: Detail; events: SupportEvent[] }) {
  const { school, onboarding } = detail;
  // De eerste stap die nog niet is gezet: daar is het gesprek over.
  const gestopt = onboarding.find((stap) => !stap.gereed);

  // `?? null` en niet destructuring: dit scherm mag ook draaien tegen een
  // database waar de migratie nog niet op is toegepast. Dan is er simpelweg
  // geen licentieblok, en blijft alleen het Stripe-deel over.
  const licentie = detail.licentie ?? null;
  const conflict = tegenspraak(licentie, detail.abonnement);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}><Link href="/support" aria-label="Ribba Support overzicht"><RibbaLogo height={25} /></Link><span>Support</span></header>
      <main className={styles.content}>
      <Link href="/support" style={s.terug}>← Alle rijscholen</Link>

      <div className={styles.hero}>
        <div><p className={styles.eyebrow}>Schooldossier {school.is_internal && <span style={s.intern}>Testschool</span>}</p>
          <h1 className={styles.title}>{school.naam}</h1>
          <p className={styles.subtitle}>{school.plaats ?? 'Plaats niet ingevuld'} · ingeschreven {datum(school.aangemaakt)}</p>
        </div>
        <Link href={`/support/${id}/bewerken`} className={styles.primaryButton}>Schoolgegevens bewerken <span aria-hidden="true">↗</span></Link>
      </div>
      <nav className={styles.navigation} aria-label="Onderdelen van het schooldossier">
        <a href="#overzicht">Overzicht</a><a href="#gegevens">Schoolgegevens</a><a href="#account">Account en koppelingen</a><a href="#activiteit">Activiteit</a>
      </nav>

      {licentie?.is_proef && (
        // Een proef die deze week afloopt is het eerste wat je wil weten als je
        // deze rijschool aan de lijn krijgt, dus die staat boven en niet in een
        // kaart verderop.
        <div style={
          licentie.proef_verlopen ? s.signaalRood
          : (licentie.proef_dagen_resterend ?? 99) <= 7 ? s.signaal
          : s.signaalInfo
        }>
          {licentie.proef_verlopen ? (
            <>Proefabonnement <strong>verlopen</strong> op {datum(licentie.proef_tot)}</>
          ) : (
            <>
              Proefabonnement loopt nog{' '}
              <strong>{dagen(licentie.proef_dagen_resterend ?? 0)}</strong>
              {' '}— tot {datum(licentie.proef_tot)}
            </>
          )}
        </div>
      )}

      {conflict && <div style={s.signaalRood}>{conflict}</div>}

      {gestopt && (
        <div style={s.signaal}>
          Eerstvolgende openstaande stap: <strong>{gestopt.label}</strong>
          {gestopt.blokkerend && ' — dit blokkeert het gebruik van de app'}
        </div>
      )}

      <div className={styles.grid}>
        <section className={styles.card} id="overzicht">
          <div className={styles.cardHeading}><h2 className={styles.sectionTitle}>Aan de slag</h2><span>{onboarding.filter(stap => stap.gereed).length} van {onboarding.length} stappen</span></div>
          <ol style={s.stappen}>
            {onboarding.map((stap) => (
              <li key={stap.sleutel} className={styles.stap}>
                <span style={stap.gereed ? s.bolOk : (stap.blokkerend ? s.bolBlok : s.bolLeeg)} />
                <span style={stap.gereed ? s.stapLabel : s.stapLabelOpen}>{stap.label}</span>
                <span className={styles.stapDatum}>
                  {stap.wanneer ? moment(stap.wanneer) : (stap.gereed ? 'gedaan' : '—')}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Abonnement</h2>
          <p className={styles.voetnoot}>
            Betaald loopt via Stripe; de proefperiode wordt op dit moment nog
            door Ribba zelf gezet. Twee bronnen, dus apart getoond.
          </p>
          <dl className={styles.lijst}>
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
        </section>

        <section className={styles.card} id="gegevens">
          <div className={styles.cardHeading}><h2 className={styles.sectionTitle}>Schoolgegevens</h2><Link href={`/support/${id}/bewerken`}>Bewerken ↗</Link></div>
          <dl className={styles.lijst}>
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
        </section>

        <section className={styles.card} id="account">
          <h2 className={styles.sectionTitle}>Instructeurs</h2>
          <p className={styles.voetnoot}>
            Namen en e-mailadressen horen bij niveau 1 en staan hier bewust niet.
          </p>
          <div style={s.tabelWrap}><table style={s.tabel}>
            <thead>
              <tr><th style={s.th}>Rol</th><th style={s.th}>Status</th>
                <th style={s.th}>Bevestigd</th><th style={s.th}>Laatst actief</th></tr>
            </thead>
            <tbody>
              {detail.instructeurs.map((i, n) => (
                <tr key={n}>
                  <td style={s.td}>{i.rol ?? '—'}</td>
                  <td style={s.td}>{i.status ?? '—'}</td>
                  <td style={s.td}>{i.account_bevestigd ? 'ja' : 'nee'}</td>
                  <td style={s.td}>{moment(i.laatste_activiteit)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <h2 className={styles.subsectionTitle}>Juridisch</h2>
          <dl className={styles.lijst}>
            {detail.juridisch.map((j) => (
              <Rij key={j.document} label={j.document} waarde={`${j.versie} · ${datum(j.wanneer)}`} />
            ))}
            {detail.juridisch.length === 0 && <Rij label="—" waarde="niets geaccepteerd" />}
          </dl>

          {detail.cbr && (
            <>
              <h2 className={styles.subsectionTitle}>CBR-synchronisatie</h2>
              {detail.cbr.koppeling === 'uit' && (
                <div style={s.signaalRood}>
                  Koppeling staat <strong>uit</strong> sinds {moment(detail.cbr.gewijzigd)}.
                  {detail.cbr.laatste_fout && <> Laatste fout: {detail.cbr.laatste_fout}</>}
                  {' '}De rijschool moet hem zelf weer aanzetten via Koppelingen.
                </div>
              )}
              <dl className={styles.lijst}>
                <Rij label="Koppeling" waarde={detail.cbr.koppeling} />
                <Rij label="Laatste poging" waarde={moment(detail.cbr.laatste)} />
                <Rij label="Laatst geslaagd" waarde={moment(detail.cbr.laatste_geslaagd)} />
                <Rij label="Afgelopen 7 dagen"
                  waarde={`${detail.cbr.mislukt_7d} van ${detail.cbr.runs_7d} mislukt`} />
              </dl>
            </>
          )}
        </section>
      </div>

      <section className={styles.activity} id="activiteit">
        <h2 className={styles.sectionTitle}>Gebeurtenissen</h2>
        <p className={styles.voetnoot}>
          Facturatie, webhooks, CBR en SnelStart. Van de CBR-synchronisatie
          alleen de momenten waarop hij omsloeg — die draait elk uur. Een fout krijgt
          het label Hersteld zodra een latere geslaagde run van hetzelfde type is vastgelegd.
        </p>
        <div style={s.tabelWrap}>
          <table style={s.tabel}>
            <thead>
              <tr><th style={s.th}>Wanneer</th><th style={s.th}>Bron</th>
                <th style={s.th}>Soort</th><th style={s.th}>Details</th></tr>
            </thead>
            <tbody>
              {withCbrRecovery(events).map((e, n) => (
                <tr key={n} style={e.ok || e.hersteldOp ? undefined : s.rijFout}>
                  <td style={s.td}>{moment(e.wanneer)}</td>
                  <td style={s.td}>{e.bron}</td>
                  <td style={s.td}>
                    {!e.ok && <span style={e.hersteldOp ? s.hersteldBadge : s.foutBadge}>
                      {e.hersteldOp ? 'Hersteld' : 'Fout'}
                    </span>}
                    {e.soort}
                  </td>
                  <td style={s.tdDetail}>
                    {e.detail ?? '—'}
                    {e.hersteldOp && <div style={s.herstelMoment}>Hersteld op {moment(e.hersteldOp)}</div>}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td style={s.td} colSpan={4}>Geen gebeurtenissen vastgelegd.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </main>
    </div>
  );
}

function Rij({ label, waarde }: { label: string; waarde: string | null }) {
  return (
    <>
      <dt style={s.dt}>{label}</dt>
      <dd style={s.dd}>{waarde ?? '—'}</dd>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  terug: { fontSize: 13, color: '#2563EB', textDecoration: 'none' },
  voetnoot: { fontSize: 12, color: '#78716C', margin: '-6px 0 12px' },
  signaal: {
    background: '#FFFBEB', color: '#92400E', padding: '10px 14px',
    borderRadius: 10, fontSize: 14, marginBottom: 20,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20,
  },
  stappen: { listStyle: 'none', padding: 0, margin: 0 },
  stap: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' },
  bolOk: { width: 9, height: 9, borderRadius: 999, background: '#16A34A', flexShrink: 0 },
  bolLeeg: { width: 9, height: 9, borderRadius: 999, background: '#CBD5E1', flexShrink: 0 },
  bolBlok: { width: 9, height: 9, borderRadius: 999, background: '#D97706', flexShrink: 0 },
  stapLabel: { fontSize: 14, color: '#1C1917', flex: 1 },
  stapLabelOpen: { fontSize: 14, color: '#78716C', flex: 1 },
  stapDatum: { fontSize: 12, color: '#78716C', whiteSpace: 'nowrap' },
  lijst: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0, fontSize: 13 },
  dt: { color: '#78716C' },
  dd: { color: '#1C1917', margin: 0, wordBreak: 'break-word' },
  tabelWrap: { overflowX: 'auto' },
  tabel: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '13px 12px', fontSize: 11, fontWeight: 600, color: '#78716C',
    textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
  },
  td: { padding: '13px 12px', borderBottom: '1px solid #F1F5F9', color: '#1C1917', whiteSpace: 'nowrap' },
  tdDetail: { padding: '13px 12px', borderBottom: '1px solid #F1F5F9', color: '#475569' },
  rijFout: { background: '#FEF2F2' },
  signaalRood: {
    background: '#FEF2F2', color: '#991B1B', padding: '10px 12px',
    borderRadius: 10, fontSize: 13, marginBottom: 12,
  },
  // Een proef die nog ruim loopt is informatie, geen waarschuwing. Pas onder de
  // week kleurt hij amber (s.signaal) en na afloop rood.
  signaalInfo: {
    background: '#EFF6FF', color: '#1E40AF', padding: '10px 14px',
    borderRadius: 10, fontSize: 14, marginBottom: 20,
  },
  herstelMoment: { color: '#166534', fontSize: 13, marginTop: 4 },
  hersteldBadge: {
    background: '#ECFDF5', color: '#166534', padding: '1px 7px', borderRadius: 999,
    fontSize: 11, fontWeight: 600, marginRight: 8,
  },
  foutBadge: {
    background: '#FEE2E2', color: '#991B1B', padding: '1px 7px', borderRadius: 999,
    fontSize: 11, fontWeight: 600, marginRight: 8,
  },
  intern: {
    background: '#EEF2FF', color: '#3730A3', padding: '2px 9px',
    borderRadius: 999, fontSize: 11, fontWeight: 600,
  },
};
