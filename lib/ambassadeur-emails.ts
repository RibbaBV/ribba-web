// Mails van het ambassadeursprogramma: welkom, je tip heeft betaald, en je
// geld is onderweg. Zelfde schil als de rest (lib/mail-shell.ts).
//
// Bewust geen billing_events-log zoals referral-emails.ts: die tabel eist een
// school_id, en een ambassadeur hoort bij geen enkele school. Een mislukte
// verzending logt naar de console en laat de payout-status ongemoeid, zodat de
// volgende cron-run hem opnieuw probeert.

import { escapeHtml, wrap } from './mail-shell';
import { formatCentsForDisplay } from './plan-pricing';
import { DOMAIN } from './domains';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PORTAL_URL = `${DOMAIN.referral}/ambassadeur`;

async function verstuur(to: string, onderwerp: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('ambassadeur-emails: RESEND_API_KEY ontbreekt, overgeslagen:', onderwerp, to);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'Ribba <noreply@ribba.nl>', to, subject: onderwerp, html }),
  });
  if (!res.ok) {
    console.error('ambassadeur-emails: versturen mislukt', res.status, await res.text().catch(() => ''));
  }
  return res.ok;
}

export async function stuurAmbassadeurWelkomMail(p: {
  email: string;
  tipLink: string;
  beloningCents: number;
  attributieDagen: number;
}): Promise<boolean> {
  const html = wrap({
    pillLabel: 'Je doet mee',
    pillBg: '#DCFCE7',
    pillColor: '#166534',
    title: 'Dit is jouw tiplink',
    bodyHtml: `
      <p style="margin:0 0 16px">Stuur deze link naar je rijinstructeur. Sluit de rijschool via jouw link een betaald Ribba-plan af, dan verdien jij <strong>${formatCentsForDisplay(p.beloningCents)}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;border-radius:12px;margin:0 0 16px">
        <tr><td style="padding:16px;font-size:14px;color:#0F172A;font-weight:600;word-break:break-all">
          <a href="${p.tipLink}" style="color:#2563EB">${escapeHtml(p.tipLink)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#475569">Je tip telt tot ${p.attributieDagen} dagen na de laatste klik. Je krijgt bericht zodra er geld voor je klaarstaat.</p>
    `,
    ctaLabel: 'Naar je ambassadeurspagina',
    ctaHref: PORTAL_URL,
  });
  return verstuur(p.email, 'Je tiplink voor Ribba staat klaar', html);
}

function datumNl(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function stuurAmbassadeurVerdiendMail(p: {
  email: string;
  schoolNaam: string;
  bedragCents: number;
  vrijOp: string | null;
}): Promise<boolean> {
  // Staat het geld nog in de wachttijd, dan noemt de mail de datum. Anders zou
  // hij zeggen "haal het op" terwijl de knop nog niet werkt, en dat is precies
  // het soort belofte dat we nergens willen doen.
  const wacht = p.vrijOp !== null && new Date(p.vrijOp) > new Date();
  const staart = wacht
    ? `<p style="margin:0 0 8px;font-size:14px;color:#475569">Je kunt het ophalen vanaf <strong>${escapeHtml(datumNl(p.vrijOp as string))}</strong>. We wachten die periode af omdat een rijschool zijn geld binnen 60 dagen kan terugvragen.</p>`
    : `<p style="margin:0 0 8px;font-size:14px;color:#475569">Haal je ${formatCentsForDisplay(p.bedragCents)} op via je ambassadeurspagina. De eerste keer vraagt Stripe om je gegevens en je rekeningnummer; daarna staat het geld binnen enkele werkdagen op je rekening.</p>`;

  const html = wrap({
    pillLabel: 'Verdiend',
    pillBg: '#DBEAFE',
    pillColor: '#1D4ED8',
    title: `Je hebt ${formatCentsForDisplay(p.bedragCents)} verdiend`,
    bodyHtml: `
      <p style="margin:0 0 16px"><strong>${escapeHtml(p.schoolNaam)}</strong> is via jouw tip klant geworden bij Ribba en heeft de eerste betaling gedaan.</p>
      ${staart}
    `,
    ctaLabel: wacht ? 'Naar je ambassadeurspagina' : 'Innen',
    ctaHref: PORTAL_URL,
  });
  return verstuur(p.email, `Je hebt ${formatCentsForDisplay(p.bedragCents)} verdiend met je tip`, html);
}

export async function stuurAmbassadeurUitbetaaldMail(p: {
  email: string;
  bedragCents: number;
}): Promise<boolean> {
  const html = wrap({
    pillLabel: 'Onderweg',
    pillBg: '#DCFCE7',
    pillColor: '#166534',
    title: 'Je geld is onderweg',
    bodyHtml: `
      <p style="margin:0 0 16px">We hebben <strong>${formatCentsForDisplay(p.bedragCents)}</strong> overgemaakt naar de rekening die je bij Stripe hebt opgegeven.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#475569">Reken op enkele werkdagen voordat het bedrag zichtbaar is.</p>
    `,
    ctaLabel: 'Naar je ambassadeurspagina',
    ctaHref: PORTAL_URL,
  });
  return verstuur(p.email, 'Je ambassadeursbeloning is onderweg', html);
}
