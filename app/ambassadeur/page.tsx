'use client';

// Ambassadeurspagina op link.ribba.app/ambassadeur: e-mail-OTP-login, je eigen
// tiplink, de rijscholen die via die link binnenkwamen, en je geld. Innen kan
// hier ook; de Stripe-verificatie start pas wanneer er echt iets klaarstaat.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import OtpGate from '@/components/chat/OtpGate';
import RibbaLogo from '@/app/components/RibbaLogo';
import { formatCentsForDisplay } from '@/lib/plan-pricing';
import type {
  RibbaReferralConfig,
  TipStatus,
  UitbetalingStatus,
} from '@/lib/ribba-ambassadeur-types';

type MijnGegevens = {
  campagne: RibbaReferralConfig | null;
  ambassadeur: {
    code: string;
    status: 'active' | 'disabled';
    tip_link: string;
    email: string;
    payouts_enabled: boolean;
    verificatie_nodig: boolean;
  } | null;
  tips?: Array<{
    id: string;
    school_naam: string;
    status: TipStatus;
    beloning_cents: number;
    aangemeld_op: string;
    verdiend_op: string | null;
  }>;
  uitbetalingen?: Array<{
    id: string;
    amount_cents: number;
    status: UitbetalingStatus;
    uitbetaald_op: string | null;
    created_at: string;
  }>;
  totalen?: { te_innen_cents: number; onderweg_cents: number; uitbetaald_cents: number };
};

const TIP_LABEL: Record<TipStatus, string> = {
  aangemeld: 'Ingeschreven, nog niet betaald',
  verdiend: 'Verdiend',
  void: 'Ingetrokken',
};

const UITBETALING_LABEL: Record<UitbetalingStatus, string> = {
  te_innen: 'Klaar om te innen',
  geclaimd: 'Onderweg',
  uitbetaald: 'Uitbetaald',
  mislukt: 'Mislukt',
  geannuleerd: 'Geannuleerd',
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

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AmbassadeurPagina() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessieGecheckt, setSessieGecheckt] = useState(false);
  const [mij, setMij] = useState<MijnGegevens | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<'innen' | 'stripe' | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const laadMij = useCallback(async (actieveSessie: Session) => {
    setLaden(true);
    setFout(null);
    try {
      // Terug van de Stripe-onboarding? Eerst de accountstatus verversen, zodat
      // de knop niet op de tragere webhook hoeft te wachten.
      const params = new URLSearchParams(window.location.search);
      if (params.get('onboarding') === 'return') {
        await fetch('/api/partner/stripe/status', {
          headers: { Authorization: `Bearer ${actieveSessie.access_token}` },
        }).catch(() => null);
        window.history.replaceState(null, '', '/ambassadeur');
      }

      const res = await fetch('/api/ambassadeur/me', {
        headers: { Authorization: `Bearer ${actieveSessie.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Er ging iets mis.');
      setMij(data as MijnGegevens);
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessieGecheckt(true);
      if (session) void laadMij(session);
    });
  }, [laadMij]);

  async function startVerificatie() {
    if (!session) return;
    setBezig('stripe');
    setFout(null);
    try {
      const res = await fetch('/api/partner/stripe/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ terug: 'ambassadeur' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Verificatie starten mislukt.');
      window.location.href = data.url;
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Onbekende fout');
      setBezig(null);
    }
  }

  async function innen() {
    if (!session) return;
    setBezig('innen');
    setFout(null);
    setMelding(null);
    try {
      const res = await fetch('/api/ambassadeur/innen', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Innen mislukt.');
      setMelding(
        data?.aantal > 0
          ? `We maken ${formatCentsForDisplay(data.bedrag_cents)} over. Reken op enkele werkdagen.`
          : 'Er stond niets klaar om te innen.',
      );
      await laadMij(session);
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Onbekende fout');
    } finally {
      setBezig(null);
    }
  }

  async function kopieer(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      /* geweigerd klembord is geen probleem: de link staat in beeld */
    }
  }

  async function uitloggen() {
    await getSupabase().auth.signOut();
    setSession(null);
    setMij(null);
  }

  const amb = mij?.ambassadeur;
  const totalen = mij?.totalen;

  return (
    <main className="registration-page">
      <section className="registration-card">
        <div className="registration-brand">
          <RibbaLogo height={36} />
        </div>

        <p className="registration-pill">Ribba-ambassadeur</p>
        <h1>Jouw ambassadeurspagina</h1>

        {!sessieGecheckt ? null : !session ? (
          <>
            <p className="registration-description">
              Log in met het e-mailadres waarmee je je hebt aangemeld.
            </p>
            <OtpGate
              supabase={getSupabase()}
              verifyLabel="Verifieer en log in"
              onVerified={(s) => {
                setSession(s);
                void laadMij(s);
              }}
            />
          </>
        ) : laden ? (
          <p className="registration-description">Laden…</p>
        ) : fout ? (
          <div className="alert alert-error">{fout}</div>
        ) : !amb ? (
          <>
            <p className="registration-description">
              Je doet nog niet mee. Meld je aan en je krijgt meteen je eigen tiplink.
            </p>
            <Link href="/ambassadeur/meedoen" className="btn-primary" style={{ display: 'inline-block' }}>
              Word ambassadeur
            </Link>
            <div className="divider" />
            <button type="button" className="chat-link-button" onClick={() => { void uitloggen(); }}>
              Uitloggen
            </button>
          </>
        ) : (
          <>
            {amb.status === 'disabled' && (
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                Je deelname is ingetrokken. Vragen? Mail team@ribba.nl.
              </div>
            )}

            {melding && <div className="alert alert-success" style={{ marginBottom: 20 }}>{melding}</div>}

            <div className="form-group" style={{ marginTop: 8 }}>
              <label>Jouw tiplink</label>
              <input type="text" readOnly value={amb.tip_link} onFocus={(e) => e.target.select()} />
            </div>
            <button type="button" className="btn-primary" onClick={() => { void kopieer(amb.tip_link); }}>
              {gekopieerd ? 'Gekopieerd ✓' : 'Kopieer link'}
            </button>

            <div className="divider" />

            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Je geld</h2>
            <p className="registration-description">
              Klaar om te innen: <strong>{formatCentsForDisplay(totalen?.te_innen_cents ?? 0)}</strong>
              {' · '}onderweg: {formatCentsForDisplay(totalen?.onderweg_cents ?? 0)}
              {' · '}uitbetaald: {formatCentsForDisplay(totalen?.uitbetaald_cents ?? 0)}
            </p>

            {amb.verificatie_nodig && !amb.payouts_enabled && (
              <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 16 }}>
                <strong>Nog één ding voordat we kunnen overmaken</strong>
                <br />
                Stripe, onze betaalpartner, vraagt eenmalig je gegevens en je rekeningnummer.
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={bezig === 'stripe'}
                    onClick={() => { void startVerificatie(); }}
                  >
                    {bezig === 'stripe' ? 'Bezig…' : 'Gegevens afronden'}
                  </button>
                </div>
              </div>
            )}

            {(totalen?.te_innen_cents ?? 0) > 0 && amb.payouts_enabled && (
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 12 }}
                disabled={bezig === 'innen'}
                onClick={() => { void innen(); }}
              >
                {bezig === 'innen'
                  ? 'Bezig…'
                  : `Innen (${formatCentsForDisplay(totalen?.te_innen_cents ?? 0)})`}
              </button>
            )}

            <div className="divider" />

            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Je tips</h2>
            {(mij?.tips ?? []).length === 0 ? (
              <p className="registration-description">
                Nog geen rijschool via jouw link. Stuur hem gerust nog eens door.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                {(mij?.tips ?? []).map((t) => (
                  <li key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #E2E8F0' }}>
                    <strong>{t.school_naam}</strong>
                    <div style={{ fontSize: 13, color: '#64748B' }}>
                      {TIP_LABEL[t.status]} · {datum(t.aangemeld_op)}
                      {t.status === 'verdiend' && ` · ${formatCentsForDisplay(t.beloning_cents)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {(mij?.uitbetalingen ?? []).length > 0 && (
              <>
                <div className="divider" />
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>Uitbetalingen</h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                  {(mij?.uitbetalingen ?? []).map((u) => (
                    <li key={u.id} style={{ padding: '10px 0', borderBottom: '1px solid #E2E8F0' }}>
                      <strong>{formatCentsForDisplay(u.amount_cents)}</strong>
                      <div style={{ fontSize: 13, color: '#64748B' }}>
                        {UITBETALING_LABEL[u.status]} · {datum(u.uitbetaald_op ?? u.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="divider" />
            <p className="footer-text">
              Ingelogd als {amb.email}.{' '}
              <button type="button" className="chat-link-button" onClick={() => { void uitloggen(); }}>
                Uitloggen
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
