// De HTML-schil van een Ribba-mail: logo, statuspil, titel, body, knop, footer.
//
// Stond tot september 2026 privé in referral-emails.ts. Toen het
// ambassadeursprogramma een tweede set mails kreeg, was de keuze: de schil
// kopiëren of hem delen. Gekopieerd zou hij uit de pas gaan lopen, en dan
// zien twee mails van dezelfde afzender er verschillend uit.

import { DOMAIN } from './domains';

const ACCOUNT_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || DOMAIN.account;
const LOGO_URL = `${ACCOUNT_BASE_URL}/ribba-logo.png`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface WrapOpts {
  pillLabel: string;
  pillBg: string;
  pillColor: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  ctaColor?: string;
}

export function wrap(opts: WrapOpts): string {
  const cta = opts.ctaLabel && opts.ctaHref
    ? `
      <tr><td style="padding:24px 32px 8px 32px">
        <a href="${opts.ctaHref}" style="display:inline-block;background:${opts.ctaColor || '#2563EB'};color:#FFFFFF;padding:13px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px">
          ${escapeHtml(opts.ctaLabel)}
        </a>
      </td></tr>
    `
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
        <span style="display:inline-block;background:${opts.pillBg};color:${opts.pillColor};font-size:11px;font-weight:700;padding:6px 12px;border-radius:999px;letter-spacing:0.4px;text-transform:uppercase">${escapeHtml(opts.pillLabel)}</span>
        <h1 style="margin:14px 0 0 0;font-size:24px;font-weight:800;color:#0F172A;line-height:1.25">${escapeHtml(opts.title)}</h1>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:20px 32px 8px 32px;font-size:15px;line-height:1.6;color:#1E293B">
        ${opts.bodyHtml}
      </td></tr>

      ${cta}

      <!-- Footer -->
      <tr><td style="background:#F8FAFC;padding:18px 32px;margin-top:24px;font-size:12px;text-align:center;color:#94A3B8;border-top:1px solid #E2E8F0">
        Ribba B.V. · vragen?
        <a href="mailto:team@ribba.nl" style="color:#2563EB;text-decoration:none;font-weight:600">team@ribba.nl</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`.trim();
}
