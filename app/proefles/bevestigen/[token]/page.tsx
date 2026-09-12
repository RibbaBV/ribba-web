import type { Metadata } from 'next';
import Link from 'next/link';
import ProeflesPagina, { ProeflesFout } from '@/components/proefles/ProeflesPagina';
import BevestigKnop from '@/components/proefles/BevestigKnop';
import { bekijkProefles } from '@/lib/proefles-db';
import { formatProeflesMoment } from '@/lib/proefles-slots';
import type { BevestigingWeergave } from '@/lib/proefles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bevestig je proefles – Ribba', robots: { index: false, follow: false } };

export default async function BevestigenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await bekijkProefles<BevestigingWeergave>('proefles_bevestiging_bekijken', token);
  if (!r.ok) return <ProeflesFout reden={r.reden} />;
  if (!r.data.gevonden) return <ProeflesFout reden="niet_gevonden" />;
  const a = r.data;

  if (a.status === 'verlopen') {
    return (
      <ProeflesPagina pil="Gratis proefles" titel="Deze aanvraag is verlopen"
        intro="Je hebt hem niet op tijd bevestigd, of er is een nieuwere aanvraag gedaan. Vraag gerust opnieuw aan.">
        <Link className="btn-primary proefles-roze" href="/proefles">Nieuwe proefles aanvragen</Link>
      </ProeflesPagina>
    );
  }

  return (
    <ProeflesPagina pil="Gratis proefles" titel={`Hoi ${a.voornaam}, bevestig je aanvraag`}
      intro="Pas na je bevestiging gaan we een rijschool voor je zoeken.">
      <dl className="proefles-samenvatting">
        <div><dt>Wanneer</dt><dd>{formatProeflesMoment(a.start_at)}</dd></div>
        <div><dt>Ophalen</dt><dd>{a.ophaal_adres}</dd></div>
      </dl>
      <BevestigKnop token={token} alBevestigd={a.status !== 'onbevestigd'} />
    </ProeflesPagina>
  );
}
