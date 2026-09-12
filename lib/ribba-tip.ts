// De tip van een leerling aan zijn rijinstructeur: code, cookie, attributie.
//
// Een ambassadeur deelt `https://ribba.nl/voor-rijscholen?tip=CODE`. Klikt zijn
// instructeur die aan, dan onthoudt de browser de code 30 dagen. Schrijft de
// rijschool zich in die periode in, dan reist de code mee naar
// /api/signup/start en komt hij op de pending registratie terecht.
//
// WAAROM EEN EIGEN COOKIE NAAST `ribba_ref`. Dat is de cookie van het
// rijschool-referralprogramma en die betekent iets anders: daar is de
// aangebrachte partij een leerling en betaalt de rijschool. Eén cookie voor
// beide zou op het inschrijfformulier van een rijschool niet te onderscheiden
// zijn van een leerlingcode van diezelfde school.
//
// WAAROM LAST-TOUCH. Tipt iemand je twee keer, dan wint de laatste link. Dat
// is dezelfde regel als bij `ribba_ref`, en hij is te verdedigen: de klik die
// je uiteindelijk over de streep trok, is de klik die telde.

export const TIP_COOKIE = 'ribba_tip';
export const TIP_PARAM = 'tip';
export const TIP_DAGEN = 30;

const TIP_MAX_AGE = TIP_DAGEN * 24 * 60 * 60;

// Zelfde vorm als de partnercodes: hoofdletters en cijfers, 4 tot 16 tekens.
const CODE_PATROON = /^[A-Za-z0-9]{4,16}$/;

/**
 * Normaliseert een ruwe waarde naar een geldige tipcode, of null.
 * Draait zowel in de browser (querystring) als op de server (request-body),
 * en is op beide plekken de enige plek waar de vorm wordt vastgesteld.
 */
export function normaliseerTipCode(ruw: unknown): string | null {
  if (typeof ruw !== 'string') return null;
  const code = ruw.trim().toUpperCase();
  return CODE_PATROON.test(code) ? code : null;
}

/** Leest `?tip=CODE` uit een querystring. */
export function leesTipUitZoekstring(zoekstring: string): string | null {
  return normaliseerTipCode(new URLSearchParams(zoekstring).get(TIP_PARAM));
}

/** Leest de tipcode uit een cookieheader of `document.cookie`. */
export function leesTipUitCookies(cookieString: string): string | null {
  const paar = cookieString
    .split('; ')
    .find((c) => c.startsWith(`${TIP_COOKIE}=`));
  if (!paar) return null;
  try {
    return normaliseerTipCode(decodeURIComponent(paar.slice(TIP_COOKIE.length + 1)));
  } catch {
    return null; // kapotte percent-encoding is geen tip
  }
}

/** Zet de cookie in de browser. No-op buiten de browser. */
export function bewaarTip(code: string): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${TIP_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${TIP_MAX_AGE}; SameSite=Lax`;
}

/** De tipcode die nu geldt: de URL wint van de cookie (last-touch). */
export function huidigeTip(): string | null {
  if (typeof window === 'undefined') return null;
  return leesTipUitZoekstring(window.location.search)
    ?? leesTipUitCookies(document.cookie);
}

/** De link die een ambassadeur deelt met zijn rijinstructeur. */
export function tipLink(code: string): string {
  return `https://ribba.nl/voor-rijscholen?${TIP_PARAM}=${encodeURIComponent(code)}`;
}
