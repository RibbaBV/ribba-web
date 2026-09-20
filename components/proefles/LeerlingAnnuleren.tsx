'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LEERLING_ANNULEER_MELDING, type LeerlingAnnuleerUitkomst } from '@/lib/proefles';

export default function LeerlingAnnuleren({ token, geaccepteerd }: { token: string; geaccepteerd: boolean }) {
  const router = useRouter();
  const [zeker, setZeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  async function annuleer() {
    setBezig(true);
    try {
      const res = await fetch('/api/proefles/annuleren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({})) as { uitkomst?: LeerlingAnnuleerUitkomst };
      setMelding(data.uitkomst ? LEERLING_ANNULEER_MELDING[data.uitkomst] : 'Er ging iets mis. Probeer het opnieuw.');
      router.refresh();
    } catch {
      setMelding('Geen verbinding. Probeer het opnieuw.');
    }
    setBezig(false);
    setZeker(false);
  }

  if (melding) return <div className="alert alert-info" role="status">{melding}</div>;

  if (!zeker) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setZeker(true)}>
        Proefles annuleren
      </button>
    );
  }
  return (
    <div className="proefles-bevestig-blok" role="alertdialog" aria-label="Annuleren bevestigen">
      <p>{geaccepteerd ? 'Weet je het zeker? De rijschool krijgt meteen bericht dat de proefles niet doorgaat.' : 'Weet je het zeker? We stoppen dan met zoeken.'}</p>
      <button type="button" className="btn-primary proefles-rood" onClick={annuleer} disabled={bezig}>
        {bezig ? <span className="spinner" aria-label="Bezig" /> : 'Ja, annuleer'}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setZeker(false)} disabled={bezig}>Nee, laat staan</button>
    </div>
  );
}
