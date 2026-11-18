'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';

const consentKey = 'ribba_web_analytics';
const consentEvent = 'ribba:analytics-consent';
const pages = new Set([
  '/', '/ambassadeur', '/ambassadeur/meedoen', '/login', '/mijn-ribba',
  '/mijn-ribba/referral/betaling', '/partner', '/payment/success', '/privacy',
  '/pro', '/registreren', '/registreren/ontvangen', '/rijschool-planner', '/terms',
  '/upgrade', '/upgrade/success', '/verwerkersovereenkomst', '/voorwaarden', '/welkom',
]);

function getConsent() {
  try { return localStorage.getItem(consentKey) ?? 'undecided'; }
  catch { return 'unavailable'; }
}

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(consentEvent, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(consentEvent, notify);
  };
}

function choose(value: 'accepted' | 'rejected') {
  try { localStorage.setItem(consentKey, value); }
  catch { /* Pageview collection requires a stored choice. */ }
  window.dispatchEvent(new Event(consentEvent));
}

export default function WebAnalytics() {
  const pathname = usePathname();
  const { slug } = useParams();
  // Only named pages and the public school registration form. A school slug
  // or a bearer token from chat, invite and recovery URLs must never be sent.
  const path = pages.has(pathname) ? pathname : slug && /^\/[^/]+$/.test(pathname) ? '/[slug]' : null;
  const consent = useSyncExternalStore(subscribe, getConsent, () => 'loading');
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!path || consent !== 'accepted') {
      previous.current = null;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;
    void import('@/lib/posthog').then(({ capturePageview }) => {
      if (getConsent() === 'accepted') capturePageview(path);
    }).catch(() => { /* A blocked analytics request should not affect navigation. */ });
  }, [consent, path, pathname]);

  if (!path || consent !== 'undecided') return null;
  return (
    <aside className="analytics-consent" aria-label="Toestemming voor bezoekersstatistieken">
      <p>Mogen we met PostHog meten welke pagina’s worden bezocht? <Link href="/privacy">Privacybeleid</Link></p>
      <div>
        <button type="button" onClick={() => choose('rejected')}>Weigeren</button>
        <button type="button" onClick={() => choose('accepted')}>Accepteren</button>
      </div>
    </aside>
  );
}
