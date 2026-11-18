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
export const metadata: Metadata = {
  title: 'Een vriend nodigt je uit voor Ribba',
  robots: { index: false, follow: false },
};

export default async function DeelLinkPagina({ params }: { params: Promise<{ code: string }> }) {
  const { code: ruw } = await params;
  const code = normaliseerDeelcode(decodeURIComponent(ruw ?? ''));
  const ua = (await headers()).get('user-agent');
  const resultaat = code ? await registreerLinkOpening(code, ua, deelketenDb()) : 'onbekende_code';

  if (!code || resultaat === 'onbekende_code') return <Neutraal />;

  return (
    <div className="registration-page">
      <div className="registration-card" style={{ textAlign: 'center' }}>
        <RibbaLogo />
        <h1>Een vriend nodigt je uit voor Ribba</h1>
        <p className="subtitle">
          Oefen gratis voor je theorie-examen in de Ribba-app. Download de app en maak een account aan.
        </p>
        <p className="subtitle" style={{ marginTop: 24, marginBottom: 6, fontSize: 13 }}>Code van je vriend</p>
        <p
          aria-label={`Code ${code.split('').join(' ')}`}
          style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6, margin: '0 0 8px', fontVariantNumeric: 'tabular-nums' }}
        >
          {code}
        </p>
        <p className="subtitle">Vul deze code in bij het aanmaken van je account in de app.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <AppStoreBadge />
          <GooglePlayBadge />
        </div>
        <p className="subtitle" style={{ marginTop: 24, fontSize: 13 }}>
          Heb je de app al? <a href={appDeelLink(code)}>Open in de app</a>
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
          We kennen deze uitnodigingscode niet. Vraag je vriend de link opnieuw te sturen, of download
          de Ribba-app en begin gewoon zonder code.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <AppStoreBadge />
          <GooglePlayBadge />
        </div>
      </div>
    </div>
  );
}
