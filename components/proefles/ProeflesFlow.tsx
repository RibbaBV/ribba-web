'use client';

// De aanvraagflow voor een gratis proefles: ophaallocatie → dag en tijd →
// gegevens → "check je mail". Eén toestandsmachine; niets wordt opgeslagen
// tot de laatste stap, en ook dan wordt er niemand gemaild tot de leerling
// zijn e-mailadres bevestigt.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdresZoeker from './AdresZoeker';
import type { KaartDoel } from './OphaalKaart';
import { adresBijPunt, MAX_AFSTAND_TOT_ADRES_M, type Locatie } from '@/lib/pdok';
import { proeflesDagen, formatProeflesMoment, type ProeflesDag } from '@/lib/proefles-slots';
import { binnenNederland, INDIEN_MELDING, valideerAanvraag, type IndienUitkomst } from '@/lib/proefles';
import { isValidEmail, isValidInternationalPhone } from '@/utils/validation';
import { huidigeTip } from '@/lib/ribba-tip';
import { readSignupAttribution } from '@/lib/signup-attribution';

const OphaalKaart = dynamic(() => import('./OphaalKaart'), {
  ssr: false,
  loading: () => <div className="proefles-kaart-laden">Kaart laden…</div>,
});

type Stap = 'locatie' | 'moment' | 'gegevens' | 'verstuurd';
const STAPPEN: Array<{ id: Exclude<Stap, 'verstuurd'>; label: string }> = [
  { id: 'locatie', label: 'Ophalen' },
  { id: 'moment', label: 'Dag & tijd' },
  { id: 'gegevens', label: 'Gegevens' },
];

const MIN_ZOOM_VOOR_ADRES = 14;

function leesBron(): Record<string, string> {
  const bron: Record<string, string> = {};
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid']) {
      const v = q.get(k);
      if (v) bron[k] = v;
    }
    const pagina = q.get('bron');
    if (pagina) bron.bron_pagina = pagina;
    const tip = huidigeTip();
    if (tip) bron.tip = tip;
    const attributie = readSignupAttribution();
    const referrer = attributie?.referrer ?? (document.referrer && !document.referrer.includes(window.location.hostname) ? document.referrer : '');
    if (referrer) bron.referrer = referrer;
    bron.landing_page = attributie?.landing_page ?? window.location.pathname + window.location.search;
  } catch {
    /* herkomst is best-effort */
  }
  return bron;
}

export default function ProeflesFlow() {
  const [stap, setStap] = useState<Stap>('locatie');

  // ── Stap 1: locatie ──
  const [locatie, setLocatie] = useState<Locatie | null>(null);
  const [doel, setDoel] = useState<KaartDoel | null>(null);
  const [locatieStatus, setLocatieStatus] = useState<'leeg' | 'zoekt' | 'ok' | 'uitzoomen' | 'te_ver' | 'fout'>('leeg');
  const omkeerCtrl = useRef<AbortController | null>(null);

  const kiesLocatie = useCallback((loc: Locatie) => {
    setLocatie(loc);
    setLocatieStatus('ok');
    setDoel((d) => ({ lat: loc.lat, lon: loc.lon, versie: (d?.versie ?? 0) + 1 }));
  }, []);

  const kaartVerplaatst = useCallback(async (lat: number, lon: number, zoom: number) => {
    omkeerCtrl.current?.abort();
    if (zoom < MIN_ZOOM_VOOR_ADRES) {
      setLocatie(null);
      setLocatieStatus('uitzoomen');
      return;
    }
    if (!binnenNederland(lat, lon)) {
      setLocatie(null);
      setLocatieStatus('te_ver');
      return;
    }
    const ctrl = new AbortController();
    omkeerCtrl.current = ctrl;
    setLocatieStatus('zoekt');
    try {
      const r = await adresBijPunt(lat, lon, ctrl.signal);
      if (!r || r.afstandM > MAX_AFSTAND_TOT_ADRES_M) {
        setLocatie(null);
        setLocatieStatus('te_ver');
        return;
      }
      setLocatie({ adres: r.afstandM > 60 ? `Bij ${r.adres}` : r.adres, plaats: r.plaats, lat, lon });
      setLocatieStatus('ok');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLocatieStatus('fout');
    }
  }, []);

  const [gpsBezig, setGpsBezig] = useState(false);
  function gebruikMijnLocatie() {
    if (!('geolocation' in navigator)) return;
    setGpsBezig(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGpsBezig(false);
        const { latitude: lat, longitude: lon } = pos.coords;
        setDoel((d) => ({ lat, lon, versie: (d?.versie ?? 0) + 1 }));
        await kaartVerplaatst(lat, lon, 17);
      },
      () => { setGpsBezig(false); setLocatieStatus('fout'); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // ── Stap 2: moment ──
  // Pas na mount berekenen: server en browser hebben een ander "nu".
  const [dagen, setDagen] = useState<ProeflesDag[]>([]);
  const [dagIndex, setDagIndex] = useState(0);
  const [startIso, setStartIso] = useState<string | null>(null);
  const [momentMelding, setMomentMelding] = useState<string | null>(null);

  const verversDagen = useCallback(() => {
    const d = proeflesDagen(new Date());
    setDagen(d);
    setDagIndex((i) => (d[i]?.heeftBeschikbaar ? i : Math.max(0, d.findIndex((x) => x.heeftBeschikbaar))));
  }, []);
  useEffect(() => { verversDagen(); }, [verversDagen]);

  // ── Stap 3: gegevens ──
  const [naam, setNaam] = useState('');
  const [email, setEmail] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [akkoordVoorwaarden, setAkkoordVoorwaarden] = useState(false);
  const [akkoordPrivacy, setAkkoordPrivacy] = useState(false);
  const [akkoordDelen, setAkkoordDelen] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [bezig, setBezig] = useState(false);
  const [serverMelding, setServerMelding] = useState<string | null>(null);
  const bron = useRef<Record<string, string>>({});
  useEffect(() => { bron.current = leesBron(); }, []);

  // Focus naar de nieuwe stap voor schermlezers, maar niet bij het laden.
  const hoofd = useRef<HTMLDivElement>(null);
  const eersteRender = useRef(true);
  useEffect(() => {
    if (eersteRender.current) { eersteRender.current = false; return; }
    hoofd.current?.focus();
  }, [stap]);

  function valideerLokaal(): boolean {
    const f: Record<string, string> = {};
    if (naam.trim().length < 2) f.naam = 'Vul je naam in.';
    if (!isValidEmail(email)) f.email = 'Vul een geldig e-mailadres in.';
    if (!isValidInternationalPhone(telefoon)) f.telefoon = 'Vul een geldig telefoonnummer in, bijvoorbeeld 06 12345678.';
    if (!akkoordVoorwaarden || !akkoordPrivacy || !akkoordDelen) f.toestemming = 'Vink alle drie de vakjes aan om verder te gaan.';
    setFouten(f);
    return Object.keys(f).length === 0;
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setServerMelding(null);
    if (!locatie || !startIso || !valideerLokaal()) return;

    const payload = {
      naam, email, telefoon,
      adres: locatie.adres, plaats: locatie.plaats, lat: locatie.lat, lon: locatie.lon,
      start_at: startIso,
      akkoord_voorwaarden: akkoordVoorwaarden, akkoord_privacy: akkoordPrivacy, akkoord_delen: akkoordDelen,
      website,
      bron: bron.current,
    };
    const check = valideerAanvraag(payload);
    if (!check.ok) { setFouten({ [check.fout.veld]: check.fout.melding }); return; }

    setBezig(true);
    try {
      const res = await fetch('/api/proefles/aanvragen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({})) as { uitkomst?: IndienUitkomst; melding?: string };
      const uitkomst = data.uitkomst;
      if (uitkomst === 'ingediend') {
        setStap('verstuurd');
      } else if (uitkomst === 'ongeldig_tijdslot') {
        verversDagen();
        setStartIso(null);
        setMomentMelding(INDIEN_MELDING.ongeldig_tijdslot);
        setStap('moment');
      } else if (uitkomst) {
        setServerMelding(data.melding ?? INDIEN_MELDING[uitkomst]);
      } else {
        setServerMelding('Er ging iets mis. Probeer het zo opnieuw.');
      }
    } catch {
      setServerMelding('Geen verbinding. Controleer je internet en probeer het opnieuw.');
    } finally {
      setBezig(false);
    }
  }

  const dag = dagen[dagIndex];
  const stapNummer = STAPPEN.findIndex((s) => s.id === stap);

  return (
    <div className="proefles-flow">
      {stap !== 'verstuurd' && (
        <ol className="proefles-route" aria-label="Stappen">
          {STAPPEN.map((s, i) => (
            <li key={s.id} className={i < stapNummer ? 'gedaan' : i === stapNummer ? 'nu' : undefined} aria-current={i === stapNummer ? 'step' : undefined}>
              <span className="proefles-route-punt">{i < stapNummer ? '✓' : i + 1}</span>
              <span className="proefles-route-label">{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      <div ref={hoofd} tabIndex={-1} className="proefles-stap" key={stap}>
        {stap === 'locatie' && (
          <>
            <h2>Waar mogen we je ophalen?</h2>
            <p className="proefles-uitleg">Zoek je adres of schuif de kaart tot de speld op de juiste plek staat.</p>

            <AdresZoeker onGekozen={kiesLocatie} />

            <div className="proefles-kaart">
              <OphaalKaart doel={doel} onVerplaatst={kaartVerplaatst} />
              <div className="proefles-speld" aria-hidden="true">
                <svg viewBox="0 0 40 52"><path d="M20 0C9 0 0 9 0 20c0 14.5 20 32 20 32s20-17.5 20-32C40 9 31 0 20 0z" /><circle cx="20" cy="20" r="7" fill="#fff" /></svg>
                <span className="proefles-speld-schaduw" />
              </div>
              <button type="button" className="proefles-gps" onClick={gebruikMijnLocatie} disabled={gpsBezig}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                {gpsBezig ? 'Zoeken…' : 'Mijn locatie'}
              </button>
            </div>

            <div className={`proefles-gekozen ${locatieStatus === 'ok' ? 'ok' : ''}`} aria-live="polite">
              {locatieStatus === 'leeg' && 'Nog geen ophaalplek gekozen.'}
              {locatieStatus === 'zoekt' && 'Adres zoeken…'}
              {locatieStatus === 'uitzoomen' && 'Zoom verder in om een precieze ophaalplek te kiezen.'}
              {locatieStatus === 'te_ver' && 'Kies een plek in Nederland, bij een adres.'}
              {locatieStatus === 'fout' && 'Je locatie ophalen lukte niet. Zoek je adres of schuif de kaart.'}
              {locatieStatus === 'ok' && locatie && (<><strong>Ophalen bij</strong> {locatie.adres}</>)}
            </div>

            <button type="button" className="btn-primary" disabled={locatieStatus !== 'ok' || !locatie} onClick={() => setStap('moment')}>
              Kies dag en tijd
            </button>
          </>
        )}

        {stap === 'moment' && (
          <>
            <h2>Wanneer wil je rijden?</h2>
            <p className="proefles-uitleg">Een proefles duurt een uur. Kies een moment in de komende week.</p>
            {momentMelding && <div className="alert alert-error" role="alert">{momentMelding}</div>}

            <div className="proefles-dagen" role="tablist" aria-label="Dag">
              {dagen.map((d, i) => (
                <button
                  key={d.datum}
                  type="button"
                  role="tab"
                  aria-selected={i === dagIndex}
                  disabled={!d.heeftBeschikbaar}
                  className={i === dagIndex ? 'gekozen' : undefined}
                  onClick={() => setDagIndex(i)}
                >
                  <span className="proefles-dag-week">{d.weekdag}</span>
                  <span className="proefles-dag-datum">{d.dagLabel}</span>
                </button>
              ))}
            </div>

            {dag && (
              <div className="proefles-uren" role="radiogroup" aria-label={`Tijd op ${dag.langLabel}`}>
                {dag.slots.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    role="radio"
                    aria-checked={startIso === s.iso}
                    disabled={!s.beschikbaar}
                    className={startIso === s.iso ? 'gekozen' : undefined}
                    onClick={() => { setStartIso(s.iso); setMomentMelding(null); }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className={`proefles-gekozen ${startIso ? 'ok' : ''}`} aria-live="polite">
              {startIso ? (<><strong>Proefles</strong> {formatProeflesMoment(startIso)}</>) : 'Nog geen tijd gekozen.'}
            </div>

            <button type="button" className="btn-primary" disabled={!startIso} onClick={() => setStap('gegevens')}>
              Verder
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStap('locatie')}>Terug</button>
          </>
        )}

        {stap === 'gegevens' && locatie && startIso && (
          <form onSubmit={verstuur} noValidate>
            <h2>Hoe bereikt de rijschool je?</h2>
            <p className="proefles-uitleg">Deze gegevens krijgt alleen de rijschool die je proefles accepteert.</p>

            <dl className="proefles-samenvatting">
              <div><dt>Ophalen</dt><dd>{locatie.adres}</dd><button type="button" onClick={() => setStap('locatie')}>Wijzig</button></div>
              <div><dt>Wanneer</dt><dd>{formatProeflesMoment(startIso)}</dd><button type="button" onClick={() => setStap('moment')}>Wijzig</button></div>
            </dl>

            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="pf-naam">Naam</label>
                <input id="pf-naam" autoComplete="name" value={naam} onChange={(e) => setNaam(e.target.value)} className={fouten.naam ? 'error' : undefined} aria-invalid={!!fouten.naam} />
                {fouten.naam && <p className="form-error">{fouten.naam}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="pf-telefoon">Telefoonnummer</label>
                <input id="pf-telefoon" type="tel" inputMode="tel" autoComplete="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={fouten.telefoon ? 'error' : undefined} aria-invalid={!!fouten.telefoon} />
                {fouten.telefoon && <p className="form-error">{fouten.telefoon}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="pf-email">E-mailadres</label>
                <input id="pf-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fouten.email ? 'error' : undefined} aria-invalid={!!fouten.email} />
                {fouten.email && <p className="form-error">{fouten.email}</p>}
              </div>
              {/* Honeypot: onzichtbaar voor mensen, verleidelijk voor bots. */}
              <div className="proefles-honing" aria-hidden="true">
                <label htmlFor="pf-website">Website</label>
                <input id="pf-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>

            <fieldset className="proefles-akkoord">
              <legend className="sr-only">Toestemming</legend>
              <label>
                <input type="checkbox" checked={akkoordVoorwaarden} onChange={(e) => setAkkoordVoorwaarden(e.target.checked)} />
                <span>Ik ga akkoord met de <a href="https://ribba.nl/voorwaarden" target="_blank" rel="noopener noreferrer">voorwaarden</a></span>
              </label>
              <label>
                <input type="checkbox" checked={akkoordPrivacy} onChange={(e) => setAkkoordPrivacy(e.target.checked)} />
                <span>Ik heb het <a href="https://ribba.nl/privacybeleid" target="_blank" rel="noopener noreferrer">privacybeleid</a> gelezen</span>
              </label>
              <label>
                <input type="checkbox" checked={akkoordDelen} onChange={(e) => setAkkoordDelen(e.target.checked)} />
                <span>Ik ga akkoord dat Ribba mijn naam, telefoonnummer en e-mailadres deelt met de rijschool die mijn proefles accepteert</span>
              </label>
              {fouten.toestemming && <p className="form-error">{fouten.toestemming}</p>}
            </fieldset>

            {serverMelding && <div className="alert alert-error" role="alert">{serverMelding}</div>}

            <button type="submit" className="btn-primary" disabled={bezig}>
              {bezig ? <span className="spinner" aria-label="Bezig" /> : 'Vraag mijn gratis proefles aan'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStap('moment')}>Terug</button>
          </form>
        )}

        {stap === 'verstuurd' && (
          <div className="proefles-klaar">
            <div className="proefles-klaar-icoon" aria-hidden="true">
              <svg viewBox="0 0 48 48"><rect x="4" y="10" width="40" height="28" rx="6" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M6 14l18 13 18-13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /></svg>
            </div>
            <h2>Check je mail</h2>
            <p className="proefles-uitleg">
              We hebben een mail gestuurd naar <strong>{email.trim().toLowerCase()}</strong>. Klik op de knop in die mail om je aanvraag te bevestigen.
            </p>
            <ol className="proefles-tijdlijn">
              <li><strong>Jij bevestigt</strong> je e-mailadres. Zonder bevestiging gebeurt er niets.</li>
              <li><strong>Wij vragen rijscholen</strong> bij jou in de buurt, één voor één.</li>
              <li><strong>Een rijschool accepteert</strong> en jullie krijgen allebei een bevestiging.</li>
            </ol>
            <p className="footer-text">Geen mail gezien? Kijk ook in je spam of ongewenste mail.</p>
          </div>
        )}
      </div>
    </div>
  );
}
