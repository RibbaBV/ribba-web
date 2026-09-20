import type { Metadata } from 'next';
import Link from 'next/link';
import ProeflesPagina, { ProeflesFout } from '@/components/proefles/ProeflesPagina';
import LeerlingAnnuleren from '@/components/proefles/LeerlingAnnuleren';
import { StoreBadges } from '@/app/components/StoreBadges';
import { bekijkProefles } from '@/lib/proefles-db';
import { formatProeflesMoment } from '@/lib/proefles-slots';
import type { LeerlingWeergave } from '@/lib/proefles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Je proefles – Ribba', robots: { index: false, follow: false } };

const KOP: Record<string, { pil: string; titel: string; intro: string }> = {
  onbevestigd: { pil: 'Nog één stap', titel: 'Bevestig eerst je e-mailadres', intro: 'Klik op de knop in de mail die we je stuurden. Pas dan gaan we zoeken.' },
  zoekend: { pil: 'We zoeken', titel: 'We zoeken een rijschool voor je', intro: 'We vragen goed beoordeelde rijscholen bij jou in de buurt, één voor één. Zodra er één accepteert, krijg je een mail.' },
  geaccepteerd: { pil: 'Geregeld', titel: 'Je proefles is geregeld', intro: 'De rijschool haalt je op. Neem een geldig identiteitsbewijs mee.' },
  niet_gevonden: { pil: 'Niet gelukt', titel: 'Geen rijschool gevonden', intro: 'Er was helaas geen rijschool die op dit moment kon. Probeer een ander moment.' },
  geannuleerd: { pil: 'Geannuleerd', titel: 'Deze proefles gaat niet door', intro: '' },
  verlopen: { pil: 'Verlopen', titel: 'Deze aanvraag is verlopen', intro: 'Hij is nooit bevestigd, of er kwam een nieuwere aanvraag voor in de plaats.' },
};

export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ bevestigd?: string }>;
}) {
  const { token } = await params;
  const { bevestigd } = await searchParams;
  const r = await bekijkProefles<LeerlingWeergave>('proefles_leerling_bekijken', token);
  if (!r.ok) return <ProeflesFout reden={r.reden} />;
  if (!r.data.gevonden) return <ProeflesFout reden="niet_gevonden" />;
  const a = r.data;
  const kop = KOP[a.status] ?? KOP.verlopen;
  const intro = a.status === 'geannuleerd'
    ? a.geannuleerd_door === 'rijschool'
      ? 'De rijschool heeft de proefles helaas geannuleerd. Vraag gerust een nieuwe aan, dan zoeken we een andere rijschool.'
      : 'Je hebt deze proefles geannuleerd.'
    : kop.intro;

  return (
    <ProeflesPagina pil={kop.pil} titel={kop.titel} intro={intro}>
      {bevestigd === '1' && a.status === 'zoekend' && (
        <div className="alert alert-success" role="status">Bedankt, je e-mailadres is bevestigd.</div>
      )}

      <dl className="proefles-samenvatting">
        <div><dt>Wanneer</dt><dd>{formatProeflesMoment(a.start_at, a.duur_minuten)}</dd></div>
        <div><dt>Ophalen</dt><dd>{a.ophaal_adres}</dd></div>
        {a.rijschool && (
          <>
            <div><dt>Rijschool</dt><dd>{a.rijschool.naam}{a.rijschool.plaats ? `, ${a.rijschool.plaats}` : ''}</dd></div>
            {a.rijschool.telefoon && <div><dt>Telefoon</dt><dd><a href={`tel:${a.rijschool.telefoon}`}>{a.rijschool.telefoon}</a></dd></div>}
            {a.rijschool.email && <div><dt>E-mail</dt><dd><a href={`mailto:${a.rijschool.email}`}>{a.rijschool.email}</a></dd></div>}
            {a.rijschool.website && <div><dt>Website</dt><dd>{a.rijschool.website}</dd></div>}
          </>
        )}
      </dl>

      {a.kan_annuleren && <LeerlingAnnuleren token={token} geaccepteerd={a.status === 'geaccepteerd'} />}

      {(a.status === 'niet_gevonden' || a.status === 'geannuleerd' || a.status === 'verlopen') && (
        <Link className="btn-primary proefles-roze" href="/proefles">Nieuwe proefles aanvragen</Link>
      )}

      {(a.status === 'zoekend' || a.status === 'geaccepteerd') && (
        <div className="proefles-app">
          <p><strong>Zie je proefles ook in de Ribba-app.</strong> Log in met {a.status === 'geaccepteerd' ? 'hetzelfde' : 'je'} e-mailadres.</p>
          <StoreBadges height={40} />
        </div>
      )}
    </ProeflesPagina>
  );
}
