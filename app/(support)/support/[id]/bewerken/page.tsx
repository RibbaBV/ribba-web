'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSupportToken } from '../../client';
import { PROFILE_FIELDS, PROFILE_LABELS, validateProfileChanges, type ProfileField, type SchoolProfile } from '@/lib/support-school-profile';
import styles from './profile.module.css';

type Loaded = { token: string; id: string; profile: SchoolProfile; draft: SchoolProfile };
export default function SchoolgegevensBewerken({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, status, isCurrentToken } = useSupportToken();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<{ token: string; id: string; text: string; success?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [denied, setDenied] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/support/schools/${id}/profile`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = await res.json();
        if (cancelled || !isCurrentToken(token)) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) setDenied(token);
          setMessage({ token, id, text: body.error ?? 'Ophalen mislukt. Probeer opnieuw.' });
          return;
        }
        setLoaded({ token, id, profile: body.profile, draft: { ...body.profile } });
        setMessage(null);
      } catch {
        if (!cancelled && isCurrentToken(token)) setMessage({ token, id, text: 'Geen verbinding. Probeer opnieuw.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token, id, reload, isCurrentToken]);
  const active = loaded?.token === token && loaded.id === id ? loaded : null;
  const visibleMessage = message?.token === token && message.id === id ? message : null;
  const dirty = active && PROFILE_FIELDS.some(k => active.draft[k] !== active.profile[k]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !token || busy.current) return;
    const raw = Object.fromEntries(PROFILE_FIELDS.filter(k => active.draft[k] !== active.profile[k]).map(k => [k, active.draft[k]]));
    const checked = validateProfileChanges(active.profile, raw);
    if (checked.changes === undefined) { setMessage({ token, id, text: checked.error }); return; }
    if (!Object.keys(checked.changes).length) { setMessage({ token, id, text: 'Er zijn geen wijzigingen.' }); return; }
    busy.current = true; setSaving(true); setMessage(null);
    try {
      const res = await fetch(`/api/support/schools/${id}/profile`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected: active.profile, changes: checked.changes }),
      });
      const body = await res.json();
      if (!mounted.current || !isCurrentToken(token)) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setDenied(token);
        setMessage({ token, id, text: body.error ?? 'Opslaan mislukt. Je invoer staat nog in het formulier.' });
        return;
      }
      setLoaded({ token, id, profile: body.profile, draft: { ...body.profile } });
      setMessage({ token, id, text: 'Schoolgegevens opgeslagen.', success: true });
    } catch {
      if (mounted.current && isCurrentToken(token)) setMessage({ token, id, text: 'Geen bevestiging ontvangen. Laad de gegevens opnieuw om te controleren of opslaan is gelukt.' });
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  const back = `/support/${id}`;
  if (status === 'geen-toegang' || (token && denied === token)) return <main className={styles.page}><h1>Log opnieuw in</h1><p>Je supportverificatie is verlopen of je hebt geen toegang.</p><Link href="/support">Naar support</Link></main>;
  const field = (key: ProfileField) => <label key={key} className={styles.field}>{PROFILE_LABELS[key]}
    <input name={key} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} maxLength={320} autoComplete="off" value={active?.draft[key] ?? ''} onChange={e => {
      const value = e.target.value;
      setLoaded(previous => previous && previous.token === token && previous.id === id ? { ...previous, draft: { ...previous.draft, [key]: value } } : previous);
    }} />
  </label>;
  return <main className={styles.page}>
    <Link href={back} onClick={e => { if (dirty && !window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch teruggaan?')) e.preventDefault(); }}>← Terug naar schooldossier</Link>
    <header><p className={styles.eyebrow}>Ribba Support</p><h1>Schoolgegevens bewerken</h1><p>{active?.profile.name ?? 'Gegevens ophalen…'}</p></header>
    {visibleMessage && <p role={visibleMessage.success ? 'status' : 'alert'} className={visibleMessage.success ? styles.success : styles.error}>{visibleMessage.text}</p>}
    {!active ? <><p>{visibleMessage ? 'De gegevens konden niet worden geladen.' : 'Laden…'}</p><button onClick={() => setReload(n => n + 1)}>Opnieuw proberen</button></> : <form onSubmit={save}>
      <fieldset disabled={saving} className={styles.section}><legend>Bedrijf en contact</legend><div className={styles.grid}>{(['name','email','phone','address','postal_code','city','kvk_number','btw_number'] as ProfileField[]).map(field)}</div>
        <p className={styles.note}>Het e-mailadres is het contactadres van de rijschool. Het inlogadres van een gebruiker verandert hiermee niet.</p>
      </fieldset>
      <fieldset disabled={saving} className={styles.section}><legend>Factuurgegevens</legend><div className={styles.grid}>{field('iban')}{active.profile.legal_form === 'bv' && (['legal_name','billing_address','billing_postal_code','billing_city'] as ProfileField[]).map(field)}</div>
        <p className={styles.note}>Het IBAN wordt gebruikt op facturen en in betaalinstructies van Ribba. Hiermee wijzig je geen bankrekening bij Stripe, Mollie of een boekhoudkoppeling. Bestaande facturen worden niet opnieuw uitgegeven.</p>
      </fieldset>
      <div className={styles.actions}><button type="submit" disabled={saving || !dirty}>{saving ? 'Opslaan…' : 'Wijzigingen opslaan'}</button><button type="button" disabled={saving} onClick={() => {
        if (dirty && !window.confirm('Je niet-opgeslagen wijzigingen vervallen. Gegevens opnieuw laden?')) return;
        setLoaded(null); setMessage(null); setReload(n => n + 1);
      }}>Gegevens opnieuw laden</button><span>Wijzigingen worden vastgelegd in het supportlogboek.</span></div>
    </form>}
  </main>;
}
