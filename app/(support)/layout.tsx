import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ribba Support',
  robots: { index: false, follow: false },
  icons: { icon: '/og-image.png', apple: '/og-image.png' },
};

// Een afzonderlijke root-layout geeft support een eigen browserdocument.
// Bij navigatie vanuit (site) worden ook al geladen marketingscripts verlaten.
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
