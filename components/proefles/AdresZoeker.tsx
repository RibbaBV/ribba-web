'use client';

// Adres zoeken met suggesties uit de PDOK Locatieserver. Combobox volgens het
// ARIA-patroon: pijltjes door de lijst, Enter kiest, Escape sluit.

import { useEffect, useId, useRef, useState } from 'react';
import { zoekAdressen, zoekLocatie, type Locatie, type Suggestie } from '@/lib/pdok';

type Props = {
  onGekozen: (locatie: Locatie) => void;
};

export default function AdresZoeker({ onGekozen }: Props) {
  const [tekst, setTekst] = useState('');
  const [suggesties, setSuggesties] = useState<Suggestie[]>([]);
  const [open, setOpen] = useState(false);
  const [actief, setActief] = useState(-1);
  const [fout, setFout] = useState<string | null>(null);
  const lijstId = useId();

  // Zoeken vanuit de invoer zelf, niet vanuit een effect: elke toetsaanslag
  // annuleert de vorige zoekvraag en start na een korte pauze een nieuwe.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); ctrl.current?.abort(); }, []);

  function typ(waarde: string) {
    setTekst(waarde);
    if (timer.current) clearTimeout(timer.current);
    ctrl.current?.abort();
    const term = waarde.trim();
    if (term.length < 3) {
      setSuggesties([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const c = new AbortController();
      ctrl.current = c;
      try {
        const r = await zoekAdressen(term, c.signal);
        setSuggesties(r);
        setOpen(true);
        setActief(r.length ? 0 : -1);
        setFout(null);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setFout('Adressen zoeken lukt nu niet. Schuif de kaart naar je ophaalplek.');
      }
    }, 250);
  }

  async function kies(s: Suggestie) {
    setOpen(false);
    setTekst(s.weergavenaam);
    try {
      const loc = await zoekLocatie(s.id);
      if (loc) onGekozen(loc);
      else setFout('Dit adres kunnen we niet op de kaart vinden.');
    } catch {
      setFout('Dit adres kunnen we nu niet ophalen. Probeer het opnieuw.');
    }
  }

  function toets(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggesties.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActief((i) => (i + 1) % suggesties.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActief((i) => (i <= 0 ? suggesties.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && actief >= 0) { e.preventDefault(); void kies(suggesties[actief]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="proefles-zoeker">
      <label htmlFor={`${lijstId}-invoer`} className="sr-only">Zoek je ophaaladres</label>
      <svg className="proefles-zoeker-icoon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        id={`${lijstId}-invoer`}
        type="text"
        role="combobox"
        aria-expanded={open && suggesties.length > 0}
        aria-controls={lijstId}
        aria-autocomplete="list"
        aria-activedescendant={open && actief >= 0 ? `${lijstId}-${actief}` : undefined}
        autoComplete="off"
        placeholder="Straat en huisnummer, of postcode"
        value={tekst}
        onChange={(e) => typ(e.target.value)}
        onKeyDown={toets}
        onFocus={() => suggesties.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggesties.length > 0 && (
        <ul id={lijstId} role="listbox" className="proefles-suggesties">
          {suggesties.map((s, i) => (
            <li
              key={s.id}
              id={`${lijstId}-${i}`}
              role="option"
              aria-selected={i === actief}
              className={i === actief ? 'actief' : undefined}
              onMouseDown={(e) => { e.preventDefault(); void kies(s); }}
              onMouseEnter={() => setActief(i)}
            >
              {s.weergavenaam}
            </li>
          ))}
        </ul>
      )}
      {fout && <p className="form-error">{fout}</p>}
    </div>
  );
}
