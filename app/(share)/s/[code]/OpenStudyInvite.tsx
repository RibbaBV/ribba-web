'use client';

import { useSyncExternalStore } from 'react';

function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}

export default function OpenStudyInvite({ href }: { href: string }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const ticket = new URLSearchParams(hash.slice(1)).get('uitnodiging');
  const valid = ticket && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ticket);
  return <a href={valid ? href + '#uitnodiging=' + ticket : href}>Open in de app</a>;
}
