'use client';

// Meedoen aan het ambassadeursprogramma: e-mail-OTP (dezelfde gate als de
// web-chat en de partnerportal) en daarna POST /api/ambassadeur/enroll.
// Geen wachtwoord, geen app: de drempel om een link te delen hoort laag te zijn.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import OtpGate from '@/components/chat/OtpGate';

type Props = {
  beloning: string;
  voorwaardenUrl: string;
};

type EnrollResultaat = {
  code: string;
  tip_link: string;
  bestond_al: boolean;
};

let browserClient: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}

export default function AmbassadeurEnroll({ beloning, voorwaardenUrl }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessieGecheckt, setSessieGecheckt] = useState(false);
  const [akkoord, setAkkoord] = useState(false);
  const [resultaat, setResultaat] = useState<EnrollResultaat | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessieGecheckt(true);
    });
  }, []);

  const meedoen = useCallback(async (actieveSessie: Session) => {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch('/api/ambassadeur/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${actieveSessie.access_token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Er ging iets mis. Probeer het opnieuw.');
      setResultaat(data as EnrollResultaat);
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setBezig(false);
    }
  }, []);

  async function kopieer() {
    if (!resultaat) return;
    try {
      await navigator.clipboard.writeText(resultaat.tip_link);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      /* geweigerd klembord is geen probleem: de link staat in beeld */
    }
  }

  if (!sessieGecheckt) return null;

  if (resultaat) {
    return (
      <div style={{ marginTop: 24 }}>
        <div className="alert alert-success">
          <strong>{resultaat.bestond_al ? 'Je deed al mee.' : 'Je doet mee.'}</strong>
          <br />
          Stuur deze link naar je rijinstructeur:
        </div>
        <div className="form-group" style={{ marginTop: 16 }}>
          <input type="text" readOnly value={resultaat.tip_link} onFocus={(e) => e.target.select()} />
        </div>
        <button type="button" className="btn-primary" onClick={() => { void kopieer(); }}>
          {gekopieerd ? 'Gekopieerd ✓' : 'Kopieer link'}
        </button>
        <p className="footer-text" style={{ marginTop: 16 }}>
          Volg je tips en je geld op{' '}
          <Link href="/ambassadeur" className="text-link">je ambassadeurspagina</Link>.
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Meedoen</h2>
        <p className="registration-description">
          Vul je e-mailadres in, dan krijg je een code. Meer heb je niet nodig.
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0 16px', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={akkoord}
            onChange={(e) => setAkkoord(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Ik ga akkoord met de{' '}
            <a href={voorwaardenUrl} target="_blank" rel="noopener noreferrer" className="text-link">
              voorwaarden van het ambassadeursprogramma
            </a>.
          </span>
        </label>
        {akkoord ? (
          <OtpGate
            supabase={getSupabase()}
            verifyLabel="Verifieer en doe mee"
            onVerified={(s) => {
              setSession(s);
              void meedoen(s);
            }}
          />
        ) : (
          <p className="footer-text">Zet het vinkje om verder te gaan.</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      {fout && <div className="alert alert-error" style={{ marginBottom: 16 }}>{fout}</div>}
      <p className="registration-description">
        Je bent ingelogd. Nog één klik en je link staat klaar. Je verdient {beloning} per
        rijschool die via jouw tip een betaald plan afsluit.
      </p>
      <button
        type="button"
        className="btn-primary"
        disabled={bezig}
        onClick={() => { void meedoen(session); }}
      >
        {bezig ? (<><span className="spinner" />Bezig…</>) : 'Maak mijn tiplink'}
      </button>
    </div>
  );
}
