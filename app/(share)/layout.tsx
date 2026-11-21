import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = {
  metadataBase: new URL('https://link.ribba.app'),
  icons: { icon: '/ribba-icon.png' },
};

// Invite URLs can contain a private ticket. Keep marketing scripts off this document.
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body className={inter.className}>{children}</body></html>;
}
