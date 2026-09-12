import type { Metadata } from 'next';
import ProeflesPagina, { ProeflesFout } from '@/components/proefles/ProeflesPagina';
import AanbodReactie from '@/components/proefles/AanbodReactie';
import { StoreBadges } from '@/app/components/StoreBadges';
import { bekijkProefles } from '@/lib/proefles-db';
import { formatProeflesMoment } from '@/lib/proefles-slots';
import type { AanbodWeergave } from '@/lib/proefles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Proefles-aanvraag – Ribba', robots: { index: false, follow: false } };

function kop(a: Extract<AanbodWeergave, { gevonden: true }>): { pil: string; titel: string; intro: string } {
  const wie = a.voornaam || 'Een leerling';
  if (a.status === 'geaccepteerd') {
    return { pil: 'Bevestigd', titel: `De proefles met ${a.leerling?.naam ?? wie} is van jou`, intro: 'Neem contact op als je iets wilt afstemmen. De leerling heeft jouw gegevens ook gekregen.' };
  }
  if (a.status === 'geannuleerd') {
    return { pil: 'Geannuleerd', titel: 'Deze proefles gaat niet door', intro: a.geannuleerd_door === 'leerling' ? `${wie} heeft de proefles geannuleerd. Je hoeft niets meer te doen.` : 'Je hebt deze proefles geannuleerd. De leerling heeft bericht gekregen.' };
  }
  if (a.status === 'afgewezen') {
    return { pil: 'Afgeslagen', titel: 'Je hebt deze proefles afgeslagen', intro: 'Geen probleem, we hebben een andere rijschool gevraagd.' };
  }
  if (a.kan_accepteren) {
    return { pil: 'Nieuwe leerling', titel: `${wie} zoekt een gratis proefles`, intro: 'Wil jij die geven? Wie als eerste accepteert, krijgt de leerling. Na het accepteren zie je de contactgegevens.' };
  }
  if (a.aanvraag_status === 'geaccepteerd') {
    return { pil: 'Vergeven', titel: 'Een andere rijschool was je voor', intro: 'Deze proefles is al door een andere rijschool geaccepteerd. Bedankt voor je interesse!' };
  }
  if (a.aanvraag_status === 'geannuleerd') {
    return { pil: 'Geannuleerd', titel: 'De leerling heeft geannuleerd', intro: 'Deze proefles gaat niet meer door.' };
  }
  return { pil: 'Verlopen', titel: 'Deze proefles is niet meer beschikbaar', intro: 'De aanvraag is gesloten.' };
}

export default async function AanbodPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ actie?: string }>;
}) {
  const { token } = await params;
  const { actie } = await searchParams;
  const r = await bekijkProefles<AanbodWeergave>('proefles_aanbod_bekijken', token);
  if (!r.ok) return <ProeflesFout reden={r.reden} />;
  if (!r.data.gevonden) return <ProeflesFout reden="niet_gevonden" />;
  const a = r.data;

  if (actie === 'afmelden') {
    return (
      <ProeflesPagina
        pil="Afmelden"
        titel={a.afgemeld ? 'Je bent afgemeld' : 'Geen proefles-aanvragen meer ontvangen?'}
        intro={a.afgemeld
          ? `${a.rijschool_naam ?? 'Deze rijschool'} krijgt geen proefles-aanvragen meer van Ribba.`
          : `${a.rijschool_naam ?? 'Deze rijschool'} krijgt dan geen mails meer als een leerling in de buurt een gratis proefles zoekt.`}
      >
        {!a.afgemeld && <AanbodReactie token={token} modus="afmelden" />}
      </ProeflesPagina>
    );
  }

  const k = kop(a);
  const l = a.leerling;
  const kaart = l ? `https://www.google.com/maps/search/?api=1&query=${l.ophaal_lat},${l.ophaal_lon}` : null;

  return (
    <ProeflesPagina pil={k.pil} titel={k.titel} intro={k.intro}>
      <dl className="proefles-samenvatting">
        <div><dt>Wanneer</dt><dd>{formatProeflesMoment(a.start_at, a.duur_minuten)}</dd></div>
        {l ? (
          <>
            <div><dt>Naam</dt><dd>{l.naam}</dd></div>
            <div><dt>Telefoon</dt><dd><a href={`tel:${l.telefoon}`}>{l.telefoon}</a></dd></div>
            <div><dt>E-mail</dt><dd><a href={`mailto:${l.email}`}>{l.email}</a></dd></div>
            <div><dt>Ophalen</dt><dd><a href={kaart!} target="_blank" rel="noopener noreferrer">{l.ophaal_adres}</a></dd></div>
          </>
        ) : (
          <>
            {a.ophaal_plaats && <div><dt>Ophalen in</dt><dd>{a.ophaal_plaats}</dd></div>}
            <div><dt>Afstand</dt><dd>{String(a.afstand_km).replace('.', ',')} km van je vestiging</dd></div>
          </>
        )}
      </dl>

      {a.kan_accepteren && <AanbodReactie token={token} modus="kiezen" />}
      {a.kan_annuleren && <AanbodReactie token={token} modus="annuleren" />}

      {a.status === 'geaccepteerd' && (
        <p className="proefles-klein">
          Deze gegevens krijg je om de proefles te kunnen geven. Gebruik ze niet voor andere doelen zonder toestemming van de leerling.
        </p>
      )}

      <div className="proefles-app">
        <p><strong>Rijschool? Plan je lessen in de Ribba-app.</strong> Log in met het e-mailadres waarop je deze mail kreeg, dan zie je je proeflessen daar ook.</p>
        <StoreBadges height={40} />
      </div>

      {!a.afgemeld && a.kan_accepteren && (
        <p className="proefles-klein">
          Liever geen aanvragen meer? <a href={`/proefles/aanbod/${token}?actie=afmelden`}>Afmelden</a>
        </p>
      )}
    </ProeflesPagina>
  );
}
