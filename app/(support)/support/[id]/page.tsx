'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSupportToken } from '../client';
import type { SupportEvent } from '@/lib/support-event-recovery';
import SchoolDetailView, { type Detail } from './school-detail-view';
import styles from './detail-design.module.css';

export default function SchoolDetailPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, status, isCurrentToken } = useSupportToken();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<SupportEvent[]>([]);
  const [fout, setFout] = useState('');
  const [geweigerd, setGeweigerd] = useState(false);
  const [weergaveVoor, setWeergaveVoor] = useState({ token, id });

  useEffect(() => {
    if (!token) return;
    let afgebroken = false;
    (async () => {
      const res = await fetch(`/api/support/schools/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (afgebroken || !isCurrentToken(token)) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) setGeweigerd(true);
        const body = await res.json().catch(() => ({}));
        if (afgebroken || !isCurrentToken(token)) return;
        setFout(body.error ?? 'Ophalen mislukt.');
        return;
      }
      const body = await res.json();
      if (afgebroken || !isCurrentToken(token)) return;
      setDetail(body.detail);
      setEvents(body.events ?? []);
    })();
    return () => { afgebroken = true; };
  }, [token, id, isCurrentToken]);

  // Geen data van de vorige sessie of school tonen tijdens een nieuwe aanvraag.
  if (weergaveVoor.token !== token || weergaveVoor.id !== id) {
    setWeergaveVoor({ token, id });
    setDetail(null);
    setEvents([]);
    setGeweigerd(false);
    setFout('');
    return null;
  }

  if (status === 'geen-toegang' || geweigerd) {
    return (
      <div className={styles.loading}>
        <p className={styles.voetnoot}>Je sessie is verlopen of mist de tweede factor.</p>
        <Link href="/support" className={styles.back}>Opnieuw inloggen</Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.loading}>
        <Link href="/support" className={styles.back}>← Alle rijscholen</Link>
        <p className={styles.voetnoot}>{fout || 'Laden…'}</p>
      </div>
    );
  }

  return <SchoolDetailView id={id} detail={detail} events={events} />;
}
