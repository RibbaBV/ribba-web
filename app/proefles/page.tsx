import type { Metadata } from 'next';
import ProeflesPagina from '@/components/proefles/ProeflesPagina';
import ProeflesFlow from '@/components/proefles/ProeflesFlow';

export const metadata: Metadata = {
  title: 'Gratis proefles aanvragen – Ribba',
  description:
    'Vraag in twee minuten een gratis proefles aan. Kies waar je opgehaald wilt worden en wanneer; Ribba zoekt een goed beoordeelde rijschool bij jou in de buurt.',
  alternates: { canonical: 'https://mijn.ribba.app/proefles' },
  openGraph: {
    title: 'Gratis proefles aanvragen – Ribba',
    description: 'Kies je ophaalplek en een moment. Wij zoeken een goed beoordeelde rijschool bij jou in de buurt.',
    url: 'https://mijn.ribba.app/proefles',
  },
};

export default function ProeflesPage() {
  return (
    <ProeflesPagina
      breed
      pil="Gratis proefles"
      titel="Eén uur rijden, gratis"
      intro="Kies waar we je ophalen en wanneer. Wij vragen goed beoordeelde rijscholen bij jou in de buurt, tot er één ja zegt."
    >
      <ProeflesFlow />
    </ProeflesPagina>
  );
}
