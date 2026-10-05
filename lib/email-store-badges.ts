// Ribba-logo en de downloadknoppen voor de app, voor mails.
//
// Dezelfde plaatjes als in de mails van de app (ribbaPro
// supabase/functions/_shared/store-badges.ts): de officiële Nederlandse badges
// van Apple en Google als PNG in de publieke Supabase-opslag. Gmail en Outlook
// tonen geen SVG, en Apple levert zijn badge als SVG; daarom PNG, en bij ons
// zodat we niet afhangen van adressen bij Apple of Google.

import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/app-links';

const ASSETS = 'https://vsuhctqdtsxyimzsbjds.supabase.co/storage/v1/object/public/public-assets';
export const RIBBA_LOGO_URL = `${ASSETS}/ribba-pro-logo.png`;
export const APP_STORE_BADGE_URL = `${ASSETS}/app-store-badge-nl.png`;
export const GOOGLE_PLAY_BADGE_URL = `${ASSETS}/google-play-badge-nl.png`;

/** Het Ribba-logo bovenaan een mail. */
export function ribbaLogoHtml(): string {
  return `<img src="${RIBBA_LOGO_URL}" alt="Ribba" width="160" style="max-width: 160px; height: auto; display: inline-block; border: 0;" />`;
}

/** De twee badges naast elkaar, als tabel voor Outlook. Hoogte 40 px. */
export function storeBadgesHtml(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
    <tr>
      <td style="padding: 0 8px 8px 0;">
        <a href="${APP_STORE_URL}" style="display: inline-block;"><img src="${APP_STORE_BADGE_URL}" alt="Download in de App Store" width="120" height="40" style="display: block; height: 40px; width: 120px; border: 0;" /></a>
      </td>
      <td style="padding: 0 0 8px 0;">
        <a href="${PLAY_STORE_URL}" style="display: inline-block;"><img src="${GOOGLE_PLAY_BADGE_URL}" alt="Ontdek het op Google Play" width="135" height="40" style="display: block; height: 40px; width: 135px; border: 0;" /></a>
      </td>
    </tr>
  </table>`;
}
