// Schil voor alle proefles-pagina's: logo, pil en titel op een kaart.

import RibbaLogo from '@/app/components/RibbaLogo';

type Props = {
  pil?: string;
  titel?: string;
  intro?: React.ReactNode;
  breed?: boolean;
  children?: React.ReactNode;
};

export default function ProeflesPagina({ pil, titel, intro, breed, children }: Props) {
  return (
    <main className="registration-page proefles-pagina">
      <section className={`registration-card proefles-kaartje${breed ? ' breed' : ''}`}>
        <div className="registration-brand">
          <RibbaLogo height={32} />
        </div>
        {pil && <span className="registration-pill proefles-pil">{pil}</span>}
        {titel && <h1 className="proefles-titel">{titel}</h1>}
        {intro && <p className="registration-description">{intro}</p>}
        {children}
        <div className="divider" />
        <p className="footer-text">
          Vragen? Mail <a href="mailto:team@ribba.nl">team@ribba.nl</a>
        </p>
      </section>
    </main>
  );
}

export function ProeflesFout({ reden }: { reden: 'ongeldig' | 'fout' | 'niet_gevonden' }) {
  return (
    <ProeflesPagina
      pil="Gratis proefles"
      titel={reden === 'fout' ? 'Er ging iets mis' : 'Link ongeldig'}
      intro={reden === 'fout'
        ? 'We kunnen deze pagina nu niet laden. Probeer het over een paar minuten opnieuw.'
        : 'Deze link klopt niet of bestaat niet meer. Controleer of je de hele link uit de mail hebt geopend.'}
    />
  );
}
