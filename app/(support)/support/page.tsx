'use client';

// Supportportaal — inloggen (met verplichte tweefactor) en het scholenoverzicht.
//
// Dit portaal geeft toegang tot gegevens van álle rijscholen. Eén wachtwoord
// is daarvoor te weinig, dus tweefactor is geen instelling maar een
// voorwaarde: zonder geverifieerde tweede factor kom je hier niet voorbij het
// inlogscherm, en weigert de API het ook (die controleert de aal2-claim zelf).
//
// De pagina praat nooit rechtstreeks met de database. Alles loopt via
// /api/support/*, want alleen daar wordt gelogd.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SchoolOverview from './school-overview';
import RibbaLogo from '../../components/RibbaLogo';
import type { School } from './school';
import { getSupabase, useSupportToken } from './client';
import { hasFreshSupportMfa } from '@/lib/support-session';
import { kiesFactorpad, type Factoroptie } from '@/lib/support-factorkeuze';

type Fase = 'laden' | 'login' | 'geen-toegang' | 'tweefactor-instellen' | 'tweefactor-kiezen' | 'tweefactor-invoeren' | 'portaal';


export default function SupportPage() {
  const { token, status, isCurrentToken } = useSupportToken();
  const [fase, setFase] = useState<Fase>('laden');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);

  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [code, setCode] = useState('');

  const [qr, setQr] = useState('');
  const [geheim, setGeheim] = useState('');
  const [factorId, setFactorId] = useState('');
  const [factorOpties, setFactorOpties] = useState<Factoroptie[]>([]);

  const [schoolResultaat, setSchoolResultaat] = useState<{ token: string | null; scholen: School[] }>({ token: null, scholen: [] });
  // Een nieuwe sessie mag nooit de scholen van de vorige sessie tonen, ook
  // niet terwijl haar eigen verzoek nog onderweg is of wordt geweigerd.
  const scholen = schoolResultaat.token === token ? schoolResultaat.scholen : [];
  const [toonIntern, setToonIntern] = useState(false);

  // Mag dit account aan de support-tweefactor beginnen? Uitsluitend de server
  // beantwoordt dat; hier wordt niets over rollen geraden. Alles behalve een
  // expliciete `true` telt als nee — een netwerkfout of een kapotte lookup mag
  // niemand naar de QR-code leiden.
  const isSupportmedewerker = useCallback(async (accessToken: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/support/eligibility', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return false;
      const body = await res.json();
      return body?.eligible === true;
    } catch {
      return false;
    }
  }, []);

  // Waar staat de gebruiker: uitgelogd, geen supportmedewerker, tweede factor
  // nog niet ingesteld, tweede factor nog niet gebruikt, of binnen? Bewust
  // zonder setState, zodat zowel het opstarten als een handeling hem kan
  // gebruiken.
  const bepaalFase = useCallback(async (): Promise<{ fase: Fase; factorId?: string; opties?: Factoroptie[] }> => {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (!session) return { fase: 'login' };

    if (hasFreshSupportMfa(session.access_token)) return { fase: 'portaal' };

    // Vóór álles wat met factoren te maken heeft. Een gewone leerling of
    // instructeur die hier belandt, kreeg eerder eerst een QR-code en pas
    // daarna te horen dat hij geen support is — met een achtergelaten factor
    // die zijn eigen wachtwoordreset raakt. Zie app/api/support/eligibility.
    if (!(await isSupportmedewerker(session.access_token))) {
      return { fase: 'geen-toegang' };
    }

    // Welke factor? Die vraag staat in lib/support-factorkeuze.ts, zodat hij
    // toetsbaar is zonder browser. Bij twee factoren kiest de gebruiker zelf —
    // anders zou een reservefactor onbereikbaar zijn en dus waardeloos.
    const { data: factors } = await getSupabase().auth.mfa.listFactors();
    const pad = kiesFactorpad(factors?.all);
    if (pad.soort === 'instellen') return { fase: 'tweefactor-instellen' };
    if (pad.soort === 'invoeren') return { fase: 'tweefactor-invoeren', factorId: pad.factorId };
    return { fase: 'tweefactor-kiezen', opties: pad.opties };
  }, [isSupportmedewerker]);

  // Vraagt Supabase om een nieuwe TOTP-factor en toont de QR-code.
  const startInstellen = useCallback(async () => {
    // Ruim halverwege afgebroken pogingen op, anders stapelen die zich op.
    const { data: bestaand } = await getSupabase().auth.mfa.listFactors();
    for (const f of bestaand?.all ?? []) {
      if (f.status === 'unverified') await getSupabase().auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await getSupabase().auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) { setFout('Instellen van tweefactor mislukt.'); return; }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setGeheim(data.totp.secret);
  }, []);

  const naarFase = useCallback(async (uitkomst: { fase: Fase; factorId?: string; opties?: Factoroptie[] }) => {
    // Bij een keuzescherm bewust de vorige factor wissen. Anders zou een
    // herlading de eerder gekozen factor laten staan en zou een verkeerde
    // uitdaging kunnen vertrekken zonder dat de gebruiker dat ziet.
    setFactorId(uitkomst.factorId ?? '');
    setFactorOpties(uitkomst.opties ?? []);
    setFase(uitkomst.fase);
    if (uitkomst.fase === 'tweefactor-instellen') await startInstellen();
  }, [startInstellen]);

  useEffect(() => {
    let afgebroken = false;
    (async () => {
      const uitkomst = await bepaalFase();
      if (!afgebroken) await naarFase(uitkomst);
    })();
    return () => { afgebroken = true; };
  }, [bepaalFase, naarFase]);

  const inloggen = async (e: React.FormEvent) => {
    e.preventDefault();
    setFout(''); setBezig(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password: wachtwoord });
    if (error) { setBezig(false); setFout('Inloggen mislukt.'); return; }
    setWachtwoord('');
    await naarFase(await bepaalFase());
    setBezig(false);
  };

  const codeControleren = async (e: React.FormEvent) => {
    e.preventDefault();
    setFout(''); setBezig(true);
    const { data: challenge, error: challengeError } =
      await getSupabase().auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setBezig(false); setFout('Kon geen verificatie starten.'); return;
    }
    const { error } = await getSupabase().auth.mfa.verify({
      factorId, challengeId: challenge.id, code: code.trim(),
    });
    setBezig(false);
    if (error) { setFout('Code klopt niet. Probeer de volgende.'); return; }
    setCode(''); setQr(''); setGeheim('');
    await naarFase(await bepaalFase());
  };

  const uitloggen = async () => {
    await getSupabase().auth.signOut();
    setSchoolResultaat({ token: null, scholen: [] });
    setFase('login');
  };

  // Scholen ophalen zodra we binnen zijn.
  useEffect(() => {
    if (fase !== 'portaal' || !token) return;
    let afgebroken = false;
    (async () => {
      setFout('');
      const res = await fetch(`/api/support/schools${toonIntern ? '?intern=1' : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (afgebroken || !isCurrentToken(token)) return;
      if (!res.ok) {
        setSchoolResultaat({ token: null, scholen: [] });
        if (res.status === 401 || res.status === 403) setFase('login');
        const body = await res.json().catch(() => ({}));
        if (afgebroken || !isCurrentToken(token)) return;
        setFout(body.error ?? 'Ophalen mislukt.');
        return;
      }
      const body = await res.json();
      if (afgebroken || !isCurrentToken(token)) return;
      setSchoolResultaat({ token, scholen: body.schools ?? [] });
    })();
    return () => { afgebroken = true; };
  }, [fase, toonIntern, token, isCurrentToken]);

  // Een gewijzigde auth-status wist de oude weergave vóór die wordt getoond.
  if (fase === 'portaal' && status === 'geen-toegang') {
    setSchoolResultaat({ token: null, scholen: [] });
    setFout('Je supportverificatie is verlopen. Log opnieuw in en bevestig je tweede factor.');
    setFase('login');
    return null;
  }

  if (fase === 'laden') {
    return <div style={s.container}><p style={s.stil}>Even geduld…</p></div>;
  }

  if (fase === 'login') {
    return (
      <div style={s.container}>
        <div style={s.kaart}>
          <RibbaLogo height={32} />
          <h1 style={s.h1}>Support</h1>
          <p style={s.stil}>Alleen voor medewerkers van Ribba.</p>
          <form onSubmit={inloggen}>
            <input style={s.input} type="email" placeholder="E-mailadres" value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <input style={s.input} type="password" placeholder="Wachtwoord" value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)} autoComplete="current-password" required />
            {fout && <p style={s.fout}>{fout}</p>}
            <button style={s.knop} type="submit" disabled={bezig}>
              {bezig ? 'Bezig…' : 'Inloggen'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Ingelogd, maar geen supportmedewerker. Bewust vóór elke factorhandeling:
  // wie hier belandt heeft een gewoon Ribba-account en hoort geen tweede factor
  // aan dat account over te houden. Geen QR, geen enroll.
  if (fase === 'geen-toegang') {
    return (
      <div style={s.container}>
        <div style={s.kaart}>
          <RibbaLogo height={32} />
          <h1 style={s.h1}>Geen toegang</h1>
          <p style={s.stil}>
            Dit portaal is alleen voor medewerkers van Ribba. Je bent ingelogd,
            maar dit account heeft er geen toegang toe. Er is niets aan je account
            gewijzigd.
          </p>
          <p style={s.stil}>
            Wil je naar je eigen omgeving? Ga naar <Link href="/mijn-ribba">mijn.ribba.app</Link>.
          </p>
          <button style={s.knop} type="button" onClick={uitloggen}>Uitloggen</button>
        </div>
      </div>
    );
  }

  // Twee of meer geverifieerde factoren: de gebruiker kiest zelf. Bewust geen
  // automatische terugval — een reservefactor bewaar je juist apart, dus het
  // portaal mag er nooit ongevraagd eentje uitdagen. Alleen namen, nooit id's.
  if (fase === 'tweefactor-kiezen') {
    return (
      <div style={s.container}>
        <div style={s.kaart}>
          <h1 style={s.h1}>Kies je verificatiemethode</h1>
          <p style={s.stil}>
            Er staan meerdere authenticators op dit account. Kies degene die je bij
            de hand hebt.
          </p>
          {factorOpties.map((optie) => (
            <button
              key={optie.id}
              style={s.knop}
              type="button"
              onClick={() => {
                setFout('');
                setCode('');
                setFactorId(optie.id);
                setFase('tweefactor-invoeren');
              }}
            >
              {optie.naam}
            </button>
          ))}
          <button style={s.knop} type="button" onClick={uitloggen}>Uitloggen</button>
        </div>
      </div>
    );
  }

  if (fase === 'tweefactor-instellen') {
    return (
      <div style={s.container}>
        <div style={s.kaart}>
          <h1 style={s.h1}>Tweefactor instellen</h1>
          <p style={s.stil}>
            Dit portaal toont gegevens van alle rijscholen. Daarom is een tweede
            factor verplicht. Scan de code met je authenticator-app.
          </p>
          {/* De QR komt als data-URI uit Supabase; next/image heeft daar niets
              te optimaliseren en zou hem alleen door een loader duwen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR-code voor de authenticator-app" style={s.qr} />}
          {geheim && (
            <p style={s.geheim}>
              Lukt scannen niet? Voer deze sleutel handmatig in:<br /><code>{geheim}</code>
            </p>
          )}
          <form onSubmit={codeControleren}>
            <input style={s.input} inputMode="numeric" placeholder="6-cijferige code"
              value={code} onChange={(e) => setCode(e.target.value)} required />
            {fout && <p style={s.fout}>{fout}</p>}
            <button style={s.knop} type="submit" disabled={bezig || !factorId}>
              {bezig ? 'Bezig…' : 'Bevestigen'}
            </button>
          </form>
          <button style={s.tekstknop} onClick={uitloggen}>Uitloggen</button>
        </div>
      </div>
    );
  }

  if (fase === 'tweefactor-invoeren') {
    return (
      <div style={s.container}>
        <div style={s.kaart}>
          <h1 style={s.h1}>Tweefactor</h1>
          <p style={s.stil}>Voer de code uit je authenticator-app in.</p>
          <form onSubmit={codeControleren}>
            <input style={s.input} inputMode="numeric" placeholder="6-cijferige code"
              value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
            {fout && <p style={s.fout}>{fout}</p>}
            <button style={s.knop} type="submit" disabled={bezig}>
              {bezig ? 'Bezig…' : 'Verder'}
            </button>
          </form>
          <button style={s.tekstknop} onClick={uitloggen}>Uitloggen</button>
        </div>
      </div>
    );
  }

  return <SchoolOverview scholen={scholen} fout={fout} toonIntern={toonIntern}
    onToonIntern={setToonIntern} onUitloggen={uitloggen} />;
}

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F8FAFC', padding: 24,
  },
  kaart: {
    background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 4,
  },
  stil: { fontSize: 14, color: '#64748B', margin: '0 0 16px' },
  input: {
    width: '100%', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: 10,
    fontSize: 15, marginTop: 10, boxSizing: 'border-box',
  },
  knop: {
    width: '100%', marginTop: 14, padding: '12px 16px', border: 'none', borderRadius: 10,
    background: '#2563EB', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  tekstknop: {
    marginTop: 14, background: 'none', border: 'none', color: '#64748B',
    fontSize: 14, cursor: 'pointer', padding: 0, textAlign: 'left',
  },
  fout: { color: '#B91C1C', fontSize: 14, marginTop: 12 },
  qr: { width: 200, height: 200, alignSelf: 'center', margin: '8px 0' },
  geheim: { fontSize: 12, color: '#64748B', wordBreak: 'break-all', margin: '0 0 8px' },
};
