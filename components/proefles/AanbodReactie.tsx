'use client';

// De knoppen op de aanbodpagina voor de rijschool. Na elke actie ververst de
// pagina server-side, zodat wat je ziet altijd uit de database komt en niet
// uit wat deze knop dacht dat er gebeurde.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AANBOD_MELDING, type AanbodActie, type AanbodUitkomst } from '@/lib/proefles';

type Modus = 'kiezen' | 'annuleren' | 'afmelden';

const SUCCES: ReadonlySet<AanbodUitkomst> = new Set(['geaccepteerd', 'afgewezen', 'geannuleerd', 'afgemeld']);

export default function AanbodReactie({ token, modus }: { token: string; modus: Modus }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<AanbodActie | null>(null);
  const [zeker, setZeker] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; goed: boolean } | null>(null);

  async function doe(actie: AanbodActie) {
    setBezig(actie);
    setMelding(null);
    try {
      const res = await fetch('/api/proefles/aanbod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, actie }),
      });
      const data = await res.json().catch(() => ({})) as { uitkomst?: AanbodUitkomst };
      if (data.uitkomst) {
        setMelding({ tekst: AANBOD_MELDING[data.uitkomst], goed: SUCCES.has(data.uitkomst) });
      } else {
        setMelding({ tekst: res.status === 429 ? 'Te veel verzoeken. Wacht even en probeer het opnieuw.' : 'Er ging iets mis. Probeer het opnieuw.', goed: false });
      }
      router.refresh();
    } catch {
      setMelding({ tekst: 'Geen verbinding. Probeer het opnieuw.', goed: false });
    }
    setBezig(null);
    setZeker(false);
  }

  const spinner = <span className="spinner" aria-label="Bezig" />;
  const meldingBlok = melding && (
    <div className={`alert ${melding.goed ? 'alert-success' : 'alert-error'}`} role="status">{melding.tekst}</div>
  );

  if (modus === 'afmelden') {
    return (
      <>
        {meldingBlok}
        <button type="button" className="btn-primary" onClick={() => doe('afmelden')} disabled={!!bezig}>
          {bezig ? spinner : 'Ja, meld mij af'}
        </button>
      </>
    );
  }

  if (modus === 'annuleren') {
    return (
      <>
        {meldingBlok}
        {!zeker ? (
          <button type="button" className="btn-secondary" onClick={() => setZeker(true)}>Proefles annuleren</button>
        ) : (
          <div className="proefles-bevestig-blok" role="alertdialog" aria-label="Annuleren bevestigen">
            <p>Weet je het zeker? De leerling krijgt meteen bericht dat de proefles niet doorgaat.</p>
            <button type="button" className="btn-primary proefles-rood" onClick={() => doe('annuleren')} disabled={!!bezig}>
              {bezig ? spinner : 'Ja, annuleer'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setZeker(false)} disabled={!!bezig}>Nee, laat staan</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {meldingBlok}
      <div className="proefles-keuze">
        <button type="button" className="btn-primary" onClick={() => doe('accepteren')} disabled={!!bezig}>
          {bezig === 'accepteren' ? spinner : 'Accepteren'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => doe('afwijzen')} disabled={!!bezig}>
          {bezig === 'afwijzen' ? 'Bezig…' : 'Nee, bedankt'}
        </button>
      </div>
    </>
  );
}
