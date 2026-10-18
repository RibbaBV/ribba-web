'use client';

import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import RibbaLogo from '../../components/RibbaLogo';
import { useSupportToken } from './client';
import styles from './support-shell.module.css';

const NavigationContext = createContext<{register: (id: string, dirty: boolean) => void; confirmLeave: () => boolean}>({ register: () => {}, confirmLeave: () => true });
export function useSupportNavigationGuard(dirty: boolean) {
  const { register } = useContext(NavigationContext);
  const id = useId();
  useEffect(() => { register(id, dirty); return () => register(id, false); }, [dirty, register, id]);
}
export function useSupportNavigationConfirm() { return useContext(NavigationContext).confirmLeave; }

export default function SupportShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { token, isCurrentToken } = useSupportToken();
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const register = useCallback((id: string, dirty: boolean) => setDrafts(previous => {
    if (!!previous[id] === dirty) return previous;
    const next = { ...previous }; if (dirty) next[id] = true; else delete next[id]; return next;
  }), []);
  const dirty = Object.values(drafts).some(Boolean);
  const confirmLeave = useCallback(() => !dirty || window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch deze pagina verlaten?'), [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetch('/api/support/dashboard/access', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
    }).then(async res => res.ok && (await res.json()).owner === true).then(owner => {
      if (!controller.signal.aborted && isCurrentToken(token)) setOwnerToken(owner ? token : null);
    }).catch(() => {});
    return () => controller.abort();
  }, [token, isCurrentToken]);
  const owner = !!token && ownerToken === token;
  return <NavigationContext.Provider value={{register, confirmLeave}}>
    <SupportFrame owner={owner} path={path} dirty={dirty}>{children}</SupportFrame>
  </NavigationContext.Provider>;
}

export function SupportFrame({ owner, path, dirty, children }: { owner: boolean; path: string; dirty: boolean; children: React.ReactNode }) {
  return (
    <div className={owner ? styles.shell : undefined} onClickCapture={event => {
        const link = (event.target as HTMLElement).closest('a');
        const destination = link ? new URL(link.href, window.location.href) : null;
        const leaving = destination && (destination.pathname !== window.location.pathname || destination.search !== window.location.search);
        if (dirty && leaving && !window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch deze pagina verlaten?')) {
          event.preventDefault(); event.stopPropagation();
        }
      }}>
      {owner && <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/support/dashboard" aria-label="Ribba dashboard"><RibbaLogo height={25} /></Link>
        <nav className={styles.nav} aria-label="Beheer">
          <Link href="/support/dashboard" aria-current={path === '/support/dashboard' ? 'page' : undefined}>Overzicht</Link>
          <Link href="/support/dashboard/journey" aria-current={path.startsWith('/support/dashboard/journey') ? 'page' : undefined}>Klantreis en support</Link>
          <Link href="/support" aria-current={!path.startsWith('/support/dashboard') ? 'page' : undefined}>Rijscholen</Link>
        </nav>
        <span className={styles.owner}>Alleen eigenaar</span>
      </aside>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
