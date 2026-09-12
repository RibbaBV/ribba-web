import { Metadata } from 'next';
import RibbaLogo from '@/app/components/RibbaLogo';
import AmbassadeurEnroll from '@/components/ambassadeur/AmbassadeurEnroll';
import { formatCentsForDisplay } from '@/lib/plan-pricing';
import type { RibbaReferralConfig } from '@/lib/ribba-ambassadeur-types';

const VOORWAARDEN_URL = 'https://ribba.nl/voorwaarden#ambassadeursprogramma';

// Publieke campagne-info via de anon-RPC. Eén bron voor het bedrag, zodat de
// pagina, de mail en de uitbetaling nooit iets anders beloven dan er gebeurt.
async function leesCampagne(): Promise<RibbaReferralConfig | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  const res = await fetch(`${url}/rest/v1/rpc/ribba_referral_publiek`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: '{}',
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as RibbaReferralConfig;
}

export const metadata: Metadata = {
  title: 'Word Ribba-ambassadeur',
  description:
    'Tip je rijinstructeur over Ribba en verdien geld zodra zijn rijschool een betaald plan afsluit.',
};

export default async function AmbassadeurMeedoenPage() {
  const campagne = await leesCampagne();
  const gesloten = !campagne || campagne.status !== 'active';
  const beloning = formatCentsForDisplay(campagne?.beloning_cents ?? 2500);
  const dagen = campagne?.attributie_dagen ?? 30;

  return (
    <main className="registration-page">
      <section className="registration-card">
        <div className="registration-brand">
          <RibbaLogo height={36} />
        </div>

        {gesloten ? (
          <>
            <p className="pill pill-red">Gesloten</p>
            <h1>Het ambassadeursprogramma is even dicht</h1>
            <p className="registration-description">
              Er kunnen nu geen nieuwe ambassadeurs bij. Vragen? Mail{' '}
              <a href="mailto:team@ribba.nl" className="text-link">team@ribba.nl</a>.
            </p>
          </>
        ) : (
          <>
            <p className="pill pill-green">Ribba Ambassadeursprogramma</p>
            <h1>Tip je rijinstructeur. Pak {beloning}.</h1>
            <p className="registration-description">
              Plant jouw rijschool de lessen nog via WhatsApp? Stuur je instructeur jouw
              persoonlijke link. Sluit zijn rijschool via die link een betaald Ribba-plan af,
              dan verdien jij {beloning}.
            </p>

            <ol style={{ margin: '20px 0 0', paddingLeft: 20, fontSize: 15, lineHeight: 1.7 }}>
              <li>Je krijgt een eigen link. Alleen je e-mailadres is nodig.</li>
              <li>Je stuurt die naar je rijinstructeur. Zijn klik telt {dagen} dagen mee.</li>
              <li>Betaalt zijn rijschool voor Ribba, dan staat jouw {beloning} klaar.</li>
              <li>Je haalt het op via Stripe en het staat binnen enkele werkdagen op je rekening.</li>
            </ol>

            <AmbassadeurEnroll beloning={beloning} voorwaardenUrl={VOORWAARDEN_URL} />

            <div className="divider" />
            <p className="footer-text">
              Je verdient pas iets als de rijschool echt betaalt. Een gratis proefperiode telt
              niet mee. Zie de{' '}
              <a href={VOORWAARDEN_URL} target="_blank" rel="noopener noreferrer" className="text-link">
                voorwaarden
              </a>.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
