'use client';

import { useEffect } from 'react';
import { TIP_COOKIE, bewaarTip, leesTipUitZoekstring } from '@/lib/ribba-tip';

// Vangt `?tip=CODE` op en bewaart hem 30 dagen. Rendert niets.
//
// Volledig client-side, net als ReferralCapture: de pagina's waar dit op staat
// zijn statisch of ISR, en `await searchParams` in de server component zou ze
// dynamisch dwingen.
//
// De code komt meestal niet hier binnen maar op ribba.nl, waar de ambassadeur
// zijn instructeur naartoe stuurt; die site plakt hem op de doorklik naar
// mijn.ribba.app. Cookies zijn niet deelbaar tussen ribba.nl en ribba.app, dus
// de querystring is de enige brug. Dit component vangt het einde ervan op.
export default function TipCapture() {
  useEffect(() => {
    const code = leesTipUitZoekstring(window.location.search);
    if (code) bewaarTip(code);
  }, []);
  return null;
}

export { TIP_COOKIE };
