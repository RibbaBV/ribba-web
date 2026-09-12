// PDOK Locatieserver: adressen zoeken en een kaartpunt omzetten naar een adres.
//
// Waarom PDOK: de open geocoder van de overheid, gebaseerd op de BAG. Geen
// sleutel, geen gebruikslimiet voor normaal gebruik, alleen Nederland — en
// alleen Nederland is precies wat de proefles nodig heeft.
// Docs: https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/

const BASIS = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

/** Verder dan dit van het dichtstbijzijnde adres is geen bruikbare ophaalplek. */
export const MAX_AFSTAND_TOT_ADRES_M = 1000;

export type Suggestie = { id: string; weergavenaam: string };

export type Locatie = {
  adres: string;
  plaats: string | null;
  lat: number;
  lon: number;
};

/** "POINT(5.12 52.09)" → { lat, lon }. */
export function parsePoint(wkt: unknown): { lat: number; lon: number } | null {
  if (typeof wkt !== 'string') return null;
  const m = /^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(wkt.trim());
  if (!m) return null;
  return { lon: Number(m[1]), lat: Number(m[2]) };
}

async function haal(url: string, signal?: AbortSignal): Promise<{ response?: { docs?: Array<Record<string, unknown>> } }> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`PDOK ${res.status}`);
  return res.json();
}

export async function zoekAdressen(q: string, signal?: AbortSignal): Promise<Suggestie[]> {
  const term = q.trim();
  if (term.length < 3) return [];
  const url = `${BASIS}/suggest?q=${encodeURIComponent(term)}&rows=6&fq=${encodeURIComponent('type:(adres OR weg OR postcode)')}`;
  const data = await haal(url, signal);
  return (data.response?.docs ?? [])
    .filter((d) => typeof d.id === 'string' && typeof d.weergavenaam === 'string')
    .map((d) => ({ id: d.id as string, weergavenaam: d.weergavenaam as string }));
}

export async function zoekLocatie(id: string, signal?: AbortSignal): Promise<Locatie | null> {
  const url = `${BASIS}/lookup?id=${encodeURIComponent(id)}&fl=weergavenaam,woonplaatsnaam,centroide_ll`;
  const data = await haal(url, signal);
  const doc = data.response?.docs?.[0];
  const punt = parsePoint(doc?.centroide_ll);
  if (!doc || !punt) return null;
  return {
    adres: String(doc.weergavenaam),
    plaats: typeof doc.woonplaatsnaam === 'string' ? doc.woonplaatsnaam : null,
    ...punt,
  };
}

export type OmgekeerdResultaat = { adres: string; plaats: string | null; afstandM: number };

export async function adresBijPunt(lat: number, lon: number, signal?: AbortSignal): Promise<OmgekeerdResultaat | null> {
  const url = `${BASIS}/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&rows=1&type=adres&fl=weergavenaam,woonplaatsnaam,afstand`;
  const data = await haal(url, signal);
  const doc = data.response?.docs?.[0];
  if (!doc || typeof doc.weergavenaam !== 'string') return null;
  return {
    adres: doc.weergavenaam,
    plaats: typeof doc.woonplaatsnaam === 'string' ? doc.woonplaatsnaam : null,
    afstandM: typeof doc.afstand === 'number' ? doc.afstand : Number.POSITIVE_INFINITY,
  };
}
