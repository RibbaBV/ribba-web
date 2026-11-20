// Landingspagina van een deellink: link.ribba.app/s/CODE (deelketen, 18 nov
// 2026). Met de app geïnstalleerd opent iOS de app via de AASA (/s/*) en komt
// een vriend hier nooit; Android pas na de store-build met pathPrefix /s
// (ribbaPro werkitem A10). Zonder app: de code groot, stores, en de uitleg
// dat de code bij het aanmaken van het account hoort. Elke echte opening
// wordt geteld (zie lib/deelketen.ts); een onbekende code toont een neutrale
// pagina en telt niets.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import RibbaLogo from '@/app/components/RibbaLogo';
import { AppStoreBadge, GooglePlayBadge } from '@/app/components/StoreBadges';
import { appDeelLink, deelketenDb, normaliseerDeelcode, registreerLinkOpening } from '@/lib/deelketen';

export const dynamic = 'force-dynamic';
type InviteProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ samen?: string | string[] }>;
};
export async function generateMetadata({ searchParams }: InviteProps): Promise<Metadata> {
  const samen = (await searchParams).samen === '1';
  const title = samen ? 'Zullen we samen gratis theorie leren op Ribba?' : 'Een vriend nodigt je uit voor Ribba';
  const description = samen
    ? 'Voeg me toe als studiemaatje. Oefen gratis met theoriekaarten, volg mijn voortgang en vergelijk onze punten.'
    : 'Oefen gratis voor je theorie-examen in de Ribba-app.';
  const image = { url: 'https://link.ribba.app/studiemaatjes-uitnodiging.jpg', width: 1200, height: 630,
    alt: 'Twee studiemaatjes oefenen verkeersborden. Zullen we samen gratis theorie leren?' };
  return { title, description, openGraph: { title, description, ...(samen && { images: [image] }) },
    ...(samen && { twitter: { card: 'summary_large_image' as const, title, description, images: [image.url] } }), robots: { index: false, follow: false } };
}

export default async function DeelLinkPagina({ params, searchParams }: InviteProps) {
  const { code: ruw } = await params;
  const samen = (await searchParams).samen === '1';
  const code = normaliseerDeelcode(ruw);
  const ua = (await headers()).get('user-agent');
  const resultaat = code ? await registreerLinkOpening(code, ua, deelketenDb()) : 'onbekende_code';

  if (!code || resultaat === 'onbekende_code') return <Neutraal />;

  return (
    <div className="registration-page">
      <div className="registration-card" style={{ textAlign: 'center' }}>
        <RibbaLogo />
        <h1>{samen ? 'Zullen we samen theorie leren?' : 'Een vriend nodigt je uit voor Ribba'}</h1>
        <p className="subtitle">
          {samen
            ? 'Word gratis studiemaatjes op Ribba. Oefen met dagelijkse theoriekaarten en volg elkaars voortgang.'
            : 'Oefen gratis voor je theorie-examen in de Ribba-app. Download de app en maak een account aan.'}
        </p>
        {samen ? (
          <p className="subtitle">Open deze link na het installeren opnieuw om je vriend een verzoek te sturen.</p>
        ) : (
          <>
            <p className="subtitle" style={{ marginTop: 24, marginBottom: 6, fontSize: 13 }}>Code van je vriend</p>
            <p
              aria-label={`Code ${code.split('').join(' ')}`}
              style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6, margin: '0 0 8px', fontVariantNumeric: 'tabular-nums' }}
            >
              {code}
            </p>
            <p className="subtitle">Vul deze code in bij het aanmaken van je account in de app.</p>
          </>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <AppStoreBadge />
          <GooglePlayBadge />
        </div>
        <p className="subtitle" style={{ marginTop: 24, fontSize: 13 }}>
          Heb je de app al? <a href={appDeelLink(code, samen)}>Open in de app</a>
        </p>
      </div>
    </div>
  );
}

function Neutraal() {
  return (
    <div className="registration-page">
      <div className="registration-card" style={{ textAlign: 'center' }}>
        <RibbaLogo />
        <h1>Deze link klopt niet helemaal</h1>
        <p className="subtitle">
          Vraag je vriend om een nieuwe uitnodigingslink, of download de Ribba-app om zelf te beginnen.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <AppStoreBadge />
          <GooglePlayBadge />
        </div>
      </div>
    </div>
  );
}
