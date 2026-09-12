'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BevestigUitkomst } from '@/lib/proefles';

const MELDING: Partial<Record<BevestigUitkomst, string>> = {
  verlopen: 'Deze aanvraag is verlopen. Vraag gerust een nieuwe proefles aan.',
  al_actief: 'Je hebt al een andere proefles-aanvraag die loopt. Deze aanvraag is daarom gesloten.',
  niet_gevonden: 'Deze link is ongeldig.',
};

export default function BevestigKnop({ token, alBevestigd }: { token: string; alBevestigd: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  async function bevestig() {
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch('/api/proefles/bevestigen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({})) as { uitkomst?: BevestigUitkomst; leerling_token?: string | null };
      if ((data.uitkomst === 'bevestigd' || data.uitkomst === 'al_bevestigd') && data.leerling_token) {
        router.replace(`/proefles/status/${data.leerling_token}${data.uitkomst === 'bevestigd' ? '?bevestigd=1' : ''}`);
        return;
      }
      setMelding((data.uitkomst && MELDING[data.uitkomst]) ?? 'Er ging iets mis. Probeer het opnieuw.');
    } catch {
      setMelding('Geen verbinding. Probeer het opnieuw.');
    }
    setBezig(false);
  }

  return (
    <>
      {melding && <div className="alert alert-error" role="alert">{melding}</div>}
      <button type="button" className="btn-primary proefles-roze" onClick={bevestig} disabled={bezig}>
        {bezig ? <span className="spinner" aria-label="Bezig" /> : alBevestigd ? 'Bekijk mijn aanvraag' : 'Ja, zoek een rijschool voor mij'}
      </button>
    </>
  );
}
