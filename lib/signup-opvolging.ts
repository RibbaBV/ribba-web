// Opvolging van een inschrijving die bij Stripe Checkout is blijven hangen —
// spoor 1b (ribbaPro werkitem A2), GO Önder 17 nov 2026.
//
// Een rijschool vult /registreren in en gaat naar Checkout. Rondt ze niet af,
// dan blijft de pending-registratie op `pending_checkout` staan. Sinds #144
// krijgt het team een mail bij de start; dit bestand regelt wat daarna komt:
//
//   na 24 uur  → herinnering aan de rijschool, met de knop om af te ronden
//   na 48 uur  → belmelding aan het team, met telefoonnummer
//
// De cron `/api/cron/signup-reminders` draait dagelijks en gebruikt uitsluitend
// de pure functies hieronder. Twee kolommen op `pending_registrations`
// (ribbaPro-migratie 20261117003000) onthouden wat al is verstuurd:
// `reminder_sent_at` en `followup_notified_at`. Daardoor is de cron herhaalbaar
// en stuurt een herstart nooit iets twee keer.
//
// WAAROM EEN VENSTER VAN 7 DAGEN. Bij de eerste run staan er rijen van weken
// oud (Rijschool Urk, 9 sep). Een herinnering "je inschrijving staat nog open"
// twee maanden later is geen herinnering meer maar een vreemde mail. Die
// oudere gevallen zijn bekend bij het team en worden gebeld, niet gemaild.
//
// HERVATTEN. De knop wijst naar /registreren. `/api/signup/start` hergebruikt
// een bestaande pending-rij op hetzelfde e-mailadres (zolang de status
// pending_checkout is) en maakt een nieuwe Checkout-sessie; `expires_at` wordt
// nergens afgedwongen. De rijschool vult het formulier opnieuw in met
// hetzelfde adres en kan dan gewoon afronden. Gecontroleerd 17 nov 2026.

import { DOMAIN } from '@/lib/domains';
import type { SchoolInfo } from '@/lib/admin-notifications';
import type { SignupAttribution } from '@/lib/signup-attribution';

export const HERINNERING_NA_UREN = 24;
export const TEAM_NA_UREN = 48;
export const VENSTER_DAGEN = 7;

/** De kolommen die de cron van `pending_registrations` leest. */
export interface PendingRij {
  id: string;
  status: string;
  school_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  plan: string | null;
  promo_code: string | null;
  created_at: string;
  reminder_sent_at: string | null;
  followup_notified_at: string | null;
  signup_attribution: SignupAttribution | null;
}

export interface Opvolging {
  /** Rijschool krijgt de herinnering. */
  herinneren: PendingRij[];
  /** Team krijgt de belmelding. */
  team: PendingRij[];
}

function urenOud(rij: PendingRij, nu: Date): number | null {
  const t = Date.parse(rij.created_at);
  if (Number.isNaN(t)) return null;
  return (nu.getTime() - t) / 3_600_000;
}

/**
 * Welke rijen krijgen vandaag welke mail. Puur: geen database, geen klok.
 *
 * Alleen `pending_checkout`. Een rij die inmiddels betaald is
 * (`checkout_completed` of verder) hoort hier nooit meer in, ook niet als de
 * kolommen nog leeg zijn: die rijschool krijgt de activatiemail.
 */
export function selecteerOpvolging(rijen: PendingRij[], nu: Date): Opvolging {
  const herinneren: PendingRij[] = [];
  const team: PendingRij[] = [];
  const maxUren = VENSTER_DAGEN * 24;
  for (const rij of rijen) {
    if (rij.status !== 'pending_checkout') continue;
    if (!rij.email) continue;
    const uren = urenOud(rij, nu);
    if (uren === null || uren > maxUren) continue;
    if (uren >= HERINNERING_NA_UREN && !rij.reminder_sent_at) herinneren.push(rij);
    if (uren >= TEAM_NA_UREN && !rij.followup_notified_at) team.push(rij);
  }
  return { herinneren, team };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LOGO_URL = `${DOMAIN.account}/ribba-logo.png`;
export const HERVAT_URL = `${DOMAIN.account}/registreren`;
export const DEMO_URL = 'https://cal.com/ribba/30min';

/** De herinnering aan de rijschool: onderwerp + html. Puur. */
export function herinneringMail(rij: PendingRij): { subject: string; html: string } {
  const voornaam = (rij.first_name ?? '').trim();
  const school = (rij.school_name ?? 'je rijschool').trim();
  const aanhef = voornaam ? `Hoi ${escapeHtml(voornaam)},` : 'Hallo,';
  return {
    subject: `Je inschrijving van ${school} bij Ribba staat nog open`,
    html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06)">
      <tr><td style="padding:32px 32px 8px 32px"><img src="${LOGO_URL}" alt="Ribba" width="96" style="display:block;height:auto;border:0"></td></tr>
      <tr><td style="padding:24px 32px 8px 32px">
        <span style="display:inline-block;background:#FEF9C3;color:#854D0E;font-size:11px;font-weight:700;padding:6px 12px;border-radius:999px;letter-spacing:0.4px;text-transform:uppercase">Nog niet afgerond</span>
        <h1 style="margin:14px 0 4px 0;font-size:24px;font-weight:800;line-height:1.2">Je inschrijving staat nog open</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1E293B">
        <p style="margin:0 0 12px">${aanhef}</p>
        <p style="margin:0 0 12px">Je bent begonnen met de inschrijving van <strong>${escapeHtml(school)}</strong> bij Ribba, maar de laatste stap bij Stripe is niet afgerond. Er is nog niets afgeschreven en er is nog geen account.</p>
        <p style="margin:0 0 12px">Wil je toch verder? Vul het formulier opnieuw in met hetzelfde e-mailadres (<strong>${escapeHtml(rij.email ?? '')}</strong>); je komt dan direct weer bij de laatste stap.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 24px 32px">
        <a href="${HERVAT_URL}" style="display:inline-block;background:#2563EB;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 22px;border-radius:12px">Inschrijving afronden</a>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;font-size:14px;line-height:1.6;color:#475569">
        <p style="margin:0 0 8px">Twijfel je nog, of wil je eerst zien hoe een rijschooldag in Ribba eruitziet? Plan een <a href="${DEMO_URL}" style="color:#2563EB;font-weight:600">gratis gesprek van 30 minuten</a>, of mail naar <a href="mailto:team@ribba.nl" style="color:#2563EB;font-weight:600">team@ribba.nl</a>.</p>
        <p style="margin:0">Wil je niet verder? Dan hoef je niets te doen. We bewaren je gegevens niet langer dan nodig.</p>
      </td></tr>
      <tr><td style="background:#F8FAFC;padding:18px 32px;font-size:12px;text-align:center;color:#94A3B8;border-top:1px solid #E2E8F0">Ribba B.V. · <a href="mailto:team@ribba.nl" style="color:#2563EB;text-decoration:none;font-weight:600">team@ribba.nl</a></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`.trim(),
  };
}

function nlTijd(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  });
}

/** De belmelding aan het team, als `SchoolInfo` voor `sendAdminNotification`. Puur. */
export function teamOpvolgingInfo(rij: PendingRij, nu: Date): SchoolInfo {
  const uren = urenOud(rij, nu);
  const a = rij.signup_attribution;
  const campagne = a
    ? [a.utm_source, a.utm_medium, a.utm_campaign].filter((v): v is string => !!v && v.trim() !== '').join(' / ')
    : '';
  return {
    name: rij.school_name ?? 'Onbekende rijschool',
    email: rij.email,
    city: rij.city,
    billing_plan: rij.plan,
    extra: {
      Contact: `${rij.first_name ?? ''} ${rij.last_name ?? ''}`.trim() || undefined,
      Telefoon: rij.phone ?? undefined,
      Gestart: nlTijd(rij.created_at),
      'Open sinds': uren === null ? undefined : `${Math.floor(uren)} uur`,
      Kortingscode: rij.promo_code ?? undefined,
      Herkomst: a?.landing_page,
      Verwijzer: a?.referrer,
      Campagne: campagne || undefined,
      Herinnering: rij.reminder_sent_at
        ? `aan de rijschool verstuurd op ${nlTijd(rij.reminder_sent_at)}`
        : 'nog niet aan de rijschool verstuurd',
      Status: 'Checkout na 48 uur nog niet afgerond. Bellen?',
    },
  };
}
