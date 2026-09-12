'use client';

// De kaart voor de ophaallocatie. De speld staat vast in het midden; de
// leerling schuift de kaart eronder. Zo is er geen marker om te verslepen
// (lastig op een telefoon) en is "waar de speld staat" altijd het midden.
//
// Alleen client-side: Leaflet raakt `window` al bij het importeren. Wordt
// daarom via next/dynamic met ssr:false geladen door ProeflesFlow.

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export type KaartDoel = { lat: number; lon: number; versie: number };

type Props = {
  /** Verandert `versie`, dan vliegt de kaart naar lat/lon (na zoeken of GPS). */
  doel: KaartDoel | null;
  /** Na elke beweging door de gebruiker: het nieuwe midden. */
  onVerplaatst: (lat: number, lon: number, zoom: number) => void;
};

const NEDERLAND: [number, number] = [52.15, 5.3];

function Bediening({ doel, onVerplaatst }: Props) {
  const map = useMap();
  // Een verplaatsing die wij zelf starten (na zoeken of GPS) hoort geen nieuw
  // adres op te zoeken: de leerling koos dat adres net zelf. We herkennen hem
  // aan de positie, niet aan een vlag: een vlag die "de volgende moveend
  // overslaan" zegt, slikt de eerste echte beweging in zodra een animatie geen
  // moveend afvuurt (in een achtergrondtabblad draait requestAnimationFrame niet).
  const laatsteDoel = useRef<{ lat: number; lon: number } | null>(null);
  const doelLat = doel?.lat;
  const doelLon = doel?.lon;
  const doelVersie = doel?.versie;

  useEffect(() => {
    if (doelLat == null || doelLon == null) return;
    laatsteDoel.current = { lat: doelLat, lon: doelLon };
    // Zonder animatie: geen afhankelijkheid van animatieframes, en de moveend
    // komt meteen.
    map.setView([doelLat, doelLon], 17, { animate: false });
  }, [map, doelLat, doelLon, doelVersie]);

  useMapEvents({
    moveend() {
      const c = map.getCenter();
      const d = laatsteDoel.current;
      if (d && Math.abs(c.lat - d.lat) < 1e-6 && Math.abs(c.lng - d.lon) < 1e-6) return;
      laatsteDoel.current = null;
      onVerplaatst(c.lat, c.lng, map.getZoom());
    },
  });
  return null;
}

export default function OphaalKaart({ doel, onVerplaatst }: Props) {
  return (
    <MapContainer
      center={doel ? [doel.lat, doel.lon] : NEDERLAND}
      zoom={doel ? 17 : 7}
      scrollWheelZoom
      zoomControl={false}
      attributionControl
      style={{ height: '100%', width: '100%' }}
    >
      {/* PDOK BRT Achtergrondkaart: open, zonder sleutel, alleen Nederland. CARTO-tegels
          tonen hier een "API KEY REQUIRED"-watermerk (gezien 12 sep 2026). */}
      <TileLayer
        attribution='Kaart: <a href="https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-brt-topnl">BRT Achtergrondkaart</a> (PDOK, CC-BY)'
        url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"
        minZoom={6}
        maxZoom={19}
      />
      <Bediening doel={doel} onVerplaatst={onVerplaatst} />
    </MapContainer>
  );
}
