// Admin notification emails — verstuurd naar de Ribba beheerder bij belangrijke
// events: nieuwe rijschool, abonnement geactiveerd, abonnement opgezegd, etc.
// Bevat altijd een samenvatting van het totale aantal rijscholen + actieve abonnementen.

import { createClient } from '@supabase/supabase-js';
import { logBillingEvent } from './billing-events';
import { DOMAIN } from './domains';
import { adPlatform, type SignupAttribution } from './signup-attribution';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'team@ribba.nl';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || DOMAIN.account;
const LOGO_URL = `${BASE_URL}/ribba-logo.png`;

export type AdminEventType =
  | 'signup_started'
  | 'signup_abandoned'
  | 'student_registered'
  | 'school_registered'
  | 'subscription_activated'
  | 'subscription_cancelled'
  | 'subscription_creation_failed'
  | 'recurring_payment_failed'
  | 'subscription_suspended';

export interface SchoolInfo {
  id?: string;
  name: string;
  email?: string | null;
  city?: string | null;
  billing_plan?: string | null;
  // Extra context for failure-events (paymentId, attempt count, error message, etc.)
  extra?: Record<string, string | number | null | undefined>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Stats {
  total: number;
  active: number;
  thisMonth: number;
  premium: number;
  basic: number;
  trial: number;
}

async function fetchStats(): Promise<Stats> {
  const empty: Stats = { total: 0, active: 0, thisMonth: 0, premium: 0, basic: 0, trial: 0 };
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // drivingschools heeft GEEN billing_plan/is_trial kolommen — die zitten op
    // instructor_licenses. Daarom 2 aparte queries: schools voor totaal+active+
    // thisMonth, licenses voor plan-counts.
    const [schoolsRes, licensesRes] = await Promise.all([
      supabase.from('drivingschools').select('status, created_at'),
      supabase
        .from('instructor_licenses')
        .select('billing_plan, is_trial, status')
        .eq('status', 'active'),
    ]);

    const schools = schoolsRes.data ?? [];
    const licenses = licensesRes.data ?? [];

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return {
      total: schools.length,
      active: schools.filter((s: { status?: string }) => s.status === 'active').length,
      thisMonth: schools.filter(
        (s: { created_at?: string }) =>
          s.created_at && new Date(s.created_at) >= startOfMonth,
      ).length,
      premium: licenses.filter(
        (l: { billing_plan?: string; is_trial?: boolean }) =>
          l.billing_plan === 'premium' && !l.is_trial,
      ).length,
      basic: licenses.filter(
        (l: { billing_plan?: string; is_trial?: boolean }) =>
          l.billing_plan === 'basic' && !l.is_trial,
      ).length,
      trial: licenses.filter(
        (l: { is_trial?: boolean }) => l.is_trial === true,
      ).length,
    };
  } catch (e) {
    console.error('admin-notifications: stats fetch failed', e);
    return empty;
  }
}

interface EventLabel {
  subject: string;
  title: string;
  pillLabel: string;
  pillBg: string;
  pillColor: string;
}

function eventLabel(type: AdminEventType): EventLabel {
  switch (type) {
    case 'signup_started':
      return {
        subject: 'Inschrijving gestart, nog niet betaald',
        title: 'Inschrijving gestart',
        pillLabel: 'Nog niet afgerond',
        pillBg: '#FEF9C3',
        pillColor: '#854D0E',
      };
    case 'signup_abandoned':
      return {
        subject: 'Inschrijving na 48 uur nog niet afgerond',
        title: 'Inschrijving niet afgerond',
        pillLabel: 'Bellen?',
        pillBg: '#FEE2E2',
        pillColor: '#991B1B',
      };
    case 'student_registered':
      return {
        subject: 'Nieuwe leerling aangemeld',
        title: 'Nieuwe leerling',
        pillLabel: 'Leerling',
        pillBg: '#DBEAFE',
        pillColor: '#1E40AF',
      };
    case 'school_registered':
      return {
        subject: 'Nieuwe rijschool aangemeld',
        title: 'Nieuwe rijschool',
        pillLabel: 'Nieuwe aanmelding',
        pillBg: '#DCFCE7',
        pillColor: '#166534',
      };
    case 'subscription_activated':
      return {
        subject: 'Nieuw abonnement afgesloten',
        title: 'Abonnement afgesloten',
        pillLabel: 'Nieuw abonnement',
        pillBg: '#CCFBF1',
        pillColor: '#134E4A',
      };
    case 'subscription_cancelled':
      return {
        subject: 'Abonnement opgezegd',
        title: 'Abonnement opgezegd',
        pillLabel: 'Opgezegd',
        pillBg: '#F1F5F9',
        pillColor: '#334155',
      };
    case 'subscription_creation_failed':
      return {
        subject: 'Subscription aanmaken mislukt — handmatig ingrijpen nodig',
        title: 'Subscription aanmaken mislukt',
        pillLabel: 'Handmatig actie',
        pillBg: '#FEE2E2',
        pillColor: '#991B1B',
      };
    case 'recurring_payment_failed':
      return {
        subject: 'SEPA-incasso mislukt',
        title: 'SEPA-incasso mislukt',
        pillLabel: 'Betaling mislukt',
        pillBg: '#FFEDD5',
        pillColor: '#9A3412',
      };
    case 'subscription_suspended':
      return {
        subject: 'Abonnement opgeschort na meerdere mislukte incassos',
        title: 'Abonnement opgeschort',
        pillLabel: 'Opgeschort',
        pillBg: '#FEE2E2',
        pillColor: '#7F1D1D',
      };
  }
}

function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;font-size:13px;color:#64748B;width:90px;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:10px 0;font-size:14px;color:#0F172A;font-weight:500">${escapeHtml(value)}</td>
    </tr>
  `;
}

function metricCell(value: number | string, label: string, color: string, withBorder: boolean): string {
  return `
    <td style="padding:16px 8px;text-align:center;${withBorder ? 'border-right:1px solid #E2E8F0;' : ''}">
      <div style="font-size:28px;font-weight:800;color:${color};line-height:1;margin-bottom:6px">${value}</div>
      <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">${escapeHtml(label)}</div>
    </td>
  `;
}

function buildHtml(type: AdminEventType, school: SchoolInfo, stats: Stats): string {
  const ev = eventLabel(type);
  const planLabel = school.billing_plan
    ? school.billing_plan.charAt(0).toUpperCase() + school.billing_plan.slice(1)
    : null;
  const sentAt = new Date().toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const extraRows = school.extra
    ? Object.entries(school.extra)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => infoRow(k, String(v)))
        .join('')
    : '';

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06)">

      <!-- Logo header -->
      <tr><td style="padding:32px 32px 8px 32px;text-align:left">
        <img src="${LOGO_URL}" alt="Ribba" width="96" style="display:block;height:auto;border:0;outline:none;text-decoration:none">
      </td></tr>

      <!-- Status pill + title -->
      <tr><td style="padding:24px 32px 8px 32px">
        <span style="display:inline-block;background:${ev.pillBg};color:${ev.pillColor};font-size:11px;font-weight:700;padding:6px 12px;border-radius:999px;letter-spacing:0.4px;text-transform:uppercase">${escapeHtml(ev.pillLabel)}</span>
        <h1 style="margin:14px 0 4px 0;font-size:24px;font-weight:800;color:#0F172A;line-height:1.2">${escapeHtml(school.name)}</h1>
        <p style="margin:0;font-size:13px;color:#94A3B8">${sentAt}</p>
      </td></tr>

      <!-- Info rows -->
      <tr><td style="padding:24px 32px 8px 32px">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
          ${school.email ? infoRow('E-mail', school.email) : ''}
          ${school.city ? infoRow('Plaats', school.city) : ''}
          ${planLabel ? infoRow('Plan', planLabel) : ''}
          ${extraRows}
        </table>
      </td></tr>

      <!-- Divider -->
      <tr><td style="padding:8px 32px"><div style="border-top:1px solid #E2E8F0"></div></td></tr>

      <!-- Stats label -->
      <tr><td style="padding:16px 32px 12px 32px">
        <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.6px">Samenvatting</div>
      </td></tr>

      <!-- Stats grid 1: total/active/thisMonth -->
      <tr><td style="padding:0 32px 12px 32px">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F8FAFC;border-radius:12px">
          <tr>
            ${metricCell(stats.total, 'Totaal', '#0F172A', true)}
            ${metricCell(stats.active, 'Actief', '#10B981', true)}
            ${metricCell(stats.thisMonth, 'Deze maand', '#2563EB', false)}
          </tr>
        </table>
      </td></tr>

      <!-- Stats grid 2: premium/basic/trial -->
      <tr><td style="padding:0 32px 32px 32px">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F8FAFC;border-radius:12px">
          <tr>
            ${metricCell(stats.premium, 'Premium', '#0D9488', true)}
            ${metricCell(stats.basic, 'Basic', '#475569', true)}
            ${metricCell(stats.trial, 'Trial', '#F59E0B', false)}
          </tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F8FAFC;padding:18px 32px;font-size:12px;text-align:center;color:#94A3B8;border-top:1px solid #E2E8F0">
        Automatisch verzonden door Ribba B.V. ·
        <a href="mailto:team@ribba.nl" style="color:#2563EB;text-decoration:none;font-weight:600">team@ribba.nl</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>
  `.trim();
}

export async function sendAdminNotification(type: AdminEventType, school: SchoolInfo): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('admin-notifications: RESEND_API_KEY not set, skipping', type, school.name);
    return;
  }
  try {
    const stats = await fetchStats();
    const ev = eventLabel(type);
    const html = buildHtml(type, school, stats);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ribba <noreply@ribba.nl>',
        to: ADMIN_EMAIL,
        subject: `${ev.subject}: ${school.name}`,
        html,
      }),
      // Een melding is bijzaak: hangt Resend, dan mag de inschrijving of
      // registratie die hem veroorzaakte daar niet op wachten.
      signal: AbortSignal.timeout(8_000),
    });

    // Body één keer lezen: id op success (voor billing_events),
    // text op fail (voor console + billing_events payload).
    let resendId: string | null = null;
    let errText = '';
    if (res.ok) {
      try {
        const body = await res.json();
        if (body && typeof body === 'object' && 'id' in body) {
          resendId = (body as { id?: string }).id ?? null;
        }
      } catch {
        /* body parse-fail is niet fataal */
      }
    } else {
      errText = await res.text().catch(() => '');
      console.error('admin-notifications: send failed', res.status, errText);
    }

    // billing-events log — non-blocking. school.id kan ontbreken bij oudere
    // callsites; sla dan de log gewoon over, mail-gedrag blijft ongewijzigd.
    if (school.id) {
      await logBillingEvent({
        school_id: school.id,
        event_type: res.ok ? 'email_sent' : 'email_failed',
        source: 'admin-notifications',
        email_type: `admin.${type}`,
        recipient: ADMIN_EMAIL,
        resend_message_id: resendId,
        payload: res.ok
          ? { subject: `${ev.subject}: ${school.name}`, school_name: school.name }
          : { status: res.status, error: errText.slice(0, 500) },
      });
    }
  } catch (e) {
    console.error('admin-notifications: unexpected error', e);
  }
}

// ── Meldingen rond inschrijven en registreren ───────────────────────────────
//
// Twee momenten waarop tot 16 nov 2026 niemand iets hoorde:
//
//   1. Een rijschool vult /registreren in en gaat naar Stripe Checkout, maar
//      rondt niet af. De pending-registratie blijft 24 uur staan en verloopt
//      stil. Rijschool Marok (11 nov) en Rijschool Urk (9 sep) verdwenen zo
//      uit beeld; de enige melding kwam pas ná een geslaagde betaling.
//   2. Een leerling schrijft zich via de website in bij een rijschool. De
//      school krijgt mail, de leerling krijgt mail, het team niets.
//
// De bouwers hieronder zijn puur: ze maken van losse velden het `SchoolInfo`
// dat `sendAdminNotification` verwacht, zodat ze zonder netwerk te testen zijn.

const INTERVAL_LABEL: Record<string, string> = { maand: 'maandelijks', jaar: 'jaarlijks' };

function herkomstRijen(attribution: SignupAttribution | null | undefined): Record<string, string | undefined> {
  if (!attribution) return {};
  const campagne = [attribution.utm_source, attribution.utm_medium, attribution.utm_campaign]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join(' / ');
  return {
    Herkomst: attribution.landing_page,
    Verwijzer: attribution.referrer,
    Campagne: campagne || adPlatform(attribution) || undefined,
  };
}

export interface SignupStartedInput {
  schoolName: string;
  email: string;
  city: string;
  plan: string;
  interval: string;
  contactName: string;
  phone: string;
  promoCode: string | null;
  attribution: SignupAttribution | null | undefined;
  /** Dezelfde rijschool klikte eerder al op Betalen; de bestaande rij is hergebruikt. */
  hervat: boolean;
  geldigUren: number;
}

/** Een rijschool heeft het inschrijfformulier afgerond en staat nu bij Stripe Checkout. */
export function signupStartedInfo(i: SignupStartedInput): SchoolInfo {
  return {
    name: i.schoolName,
    email: i.email,
    city: i.city,
    billing_plan: i.plan,
    extra: {
      Contact: i.contactName,
      Telefoon: i.phone,
      Betaling: INTERVAL_LABEL[i.interval] ?? i.interval,
      Kortingscode: i.promoCode ?? undefined,
      ...herkomstRijen(i.attribution),
      Poging: i.hervat ? 'opnieuw gestart (eerdere poging niet afgerond)' : 'eerste poging',
      Status: `Formulier ingevuld, Checkout nog niet afgerond. De inschrijflink is ${i.geldigUren} uur geldig.`,
    },
  };
}

export interface StudentRegisteredInput {
  schoolName: string;
  studentName: string;
  city: string;
  licenseType: string;
  statusLabel: string;
  /** De school had deze leerling al aangemaakt; het formulier vulde alleen aan. */
  bestaand: boolean;
  uitnodiging: 'niet' | 'uitgenodigd' | 'mislukt';
}

/**
 * Een leerling heeft zich via de website bij een rijschool ingeschreven.
 *
 * Bewust zonder e-mailadres en telefoonnummer van de leerling: die horen bij
 * de rijschool, die ze in haar eigen melding al krijgt. Het team hoeft alleen
 * te weten dát er iemand is aangemeld, waar, en of de keten werkte.
 *
 * Ook bewust zonder `id`: met een school-id schrijft `sendAdminNotification`
 * een regel in `billing_events`, en een leerlingregistratie is geen
 * billinggebeurtenis van de school.
 */
export function studentRegisteredInfo(i: StudentRegisteredInput): SchoolInfo {
  const app = i.uitnodiging === 'uitgenodigd'
    ? 'uitnodiging voor de app verstuurd'
    : i.uitnodiging === 'mislukt'
      ? 'uitnodiging voor de app MISLUKT, school is geïnformeerd'
      : 'geen uitnodiging (school beslist zelf)';
  return {
    name: i.schoolName,
    extra: {
      Leerling: i.studentName,
      Plaats: i.city,
      Rijbewijs: i.licenseType,
      Status: i.statusLabel,
      Rij: i.bestaand ? 'bestaande leerlingrij aangevuld' : 'nieuw aangemaakt',
      App: app,
    },
  };
}
