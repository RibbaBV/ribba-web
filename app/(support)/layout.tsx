import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import './support-theme.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ribba Support',
  robots: { index: false, follow: false },
  icons: {
    icon: { url: '/ribba-icon.png', type: 'image/png', sizes: '512x512' },
    shortcut: '/ribba-icon.png',
    apple: '/ribba-icon.png',
  },
};

// Een afzonderlijke root-layout geeft support een eigen browserdocument.
// Bij navigatie vanuit (site) worden ook al geladen marketingscripts verlaten.
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className={`${inter.className} support-theme`}>{children}</body>
    </html>
  );
}
