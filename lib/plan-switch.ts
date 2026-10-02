// Wisselen naar Basic aan het einde van de lopende periode — UITSLUITEND
// bedrading, geen billinglogica. De wissel zelf (Subscription Schedule,
// poorten, controle van het Stripe-antwoord) leeft in de ribbaPro edge
// function `stripe-change-plan`. Deze module doet alleen: de aanroep, de
// Nederlandse foutafhandeling en de keuze wat /upgrade laat zien.
//
// Productregel (Önder, 1 okt 2026): een downgrade gaat in aan het einde van
// de lopende periode; tot dan houdt de school Premium en kan hij terug.
// Ontwerp: ribbaPro docs/design/planwissel-ontwerp-2026-10-01.md §5.4.

export type PlanSwitchAction = 'schedule' | 'undo' | 'status';

/** Wat Stripe zegt: staat er een wissel gepland, en per wanneer? */
export type PlanSwitchStatus =
  | { known: true; scheduled: true; switchAt: string }
  | { known: true; scheduled: false }
  /** Geen Stripe-abonnement, geen eigenaar, of niet bereikbaar. */
  | { known: false };

export type PlanSwitchResult =
  | { ok: true; scheduled: boolean; switchAt: string | null }
  | { ok: false; error: string; kind: 'network' | 'definitive' };

export const GENERIC_SWITCH_ERROR =
  'Het wisselen van plan lukte niet. Probeer het opnieuw of mail team@ribba.nl.';
export const NETWORK_SWITCH_ERROR =
  'Kan geen verbinding maken. Controleer je internet en probeer het opnieuw.';

/** Hoe lang de pagina op Stripe wacht. Daarna geldt het als netwerkfout. */
export const SWITCH_TIMEOUT_MS = 15_000;

export function changePlanFunctionUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/stripe-change-plan`;
}

/**
 * Roept stripe-change-plan aan. Foutteksten van de edge function (limieten,
 * opgezegd abonnement, onbekende planning) zijn al Nederlands en gaan
 * ongewijzigd door; alleen een lege fout valt terug op een generieke melding.
 *
 * attempt_id: één per bewuste klik op "naar Basic". Bij een netwerkfout mag
 * dezelfde poging hervat worden (idempotent bij Stripe); bij een ontvangen
 * fout is de poging afgesloten en krijgt een nieuwe klik een nieuwe id.
 */
export async function callChangePlan(opts: {
  supabaseUrl: string;
  accessToken: string;
  schoolId: string;
  action: PlanSwitchAction;
  attemptId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<PlanSwitchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const body: Record<string, string> = { school_id: opts.schoolId, action: opts.action };
  if (opts.action === 'schedule') {
    body.plan = 'basic';
    if (opts.attemptId) body.attempt_id = opts.attemptId;
  }

  // Begrensd: een hangende aanroep mag de pagina niet eindeloos laten laden.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SWITCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(changePlanFunctionUrl(opts.supabaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network' };
  }

  let data: { success?: unknown; scheduled?: unknown; switch_at?: unknown; error?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    // lege/onleesbare body → generieke melding hieronder
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok || data.success !== true) {
    const serverError = typeof data.error === 'string' && data.error.trim() !== ''
      ? data.error
      : GENERIC_SWITCH_ERROR;
    return { ok: false, error: serverError, kind: 'definitive' };
  }
  // Alleen een eenduidig antwoord telt als gelukt: `scheduled` is een boolean,
  // en bij `true` hoort een leesbare datum. Al het andere is een fout, zodat de
  // pagina nooit op een half antwoord een knop of een datum toont.
  if (typeof data.scheduled !== 'boolean') {
    return { ok: false, error: GENERIC_SWITCH_ERROR, kind: 'definitive' };
  }
  if (data.scheduled) {
    const switchAt = typeof data.switch_at === 'string' ? data.switch_at : '';
    if (!switchAt || Number.isNaN(Date.parse(switchAt))) {
      return { ok: false, error: GENERIC_SWITCH_ERROR, kind: 'definitive' };
    }
    return { ok: true, scheduled: true, switchAt };
  }
  return { ok: true, scheduled: false, switchAt: null };
}

/**
 * Leest de stand voor /upgrade. FAIL-CLOSED: alles wat geen eenduidig
 * antwoord is, wordt `known: false`, en dan toont de pagina geen wisselknop.
 * Een knop die gegarandeerd faalt is erger dan geen knop; de weg via
 * team@ribba.nl blijft dan bestaan.
 */
export function statusFromResult(result: PlanSwitchResult): PlanSwitchStatus {
  if (!result.ok) return { known: false };
  if (result.scheduled && result.switchAt) return { known: true, scheduled: true, switchAt: result.switchAt };
  if (result.scheduled) return { known: false };
  return { known: true, scheduled: false };
}

/** Wat /upgrade rond de wissel laat zien. */
export type PlanSwitchView =
  /** Niets: geen eigenaar, geen Premium, opgezegd, of stand onbekend. */
  | { kind: 'none' }
  /** De knop "Na deze periode naar Basic". */
  | { kind: 'offer' }
  /** "Je gaat op {datum} naar Basic" met "Toch Premium houden". */
  | { kind: 'scheduled'; switchAt: string };

export function planSwitchView(input: {
  canManageSubscription: boolean;
  currentPlan: string | null;
  isTrial: boolean;
  cancelled: boolean;
  status: PlanSwitchStatus;
}): PlanSwitchView {
  if (!input.canManageSubscription) return { kind: 'none' };
  // Een oude proef zonder Stripe-abonnement kiest via de checkout, niet hier.
  if (input.isTrial) return { kind: 'none' };
  // Opzeggen gaat voor: de opzegfunctie laat een planning los.
  if (input.cancelled) return { kind: 'none' };
  if (!input.status.known) return { kind: 'none' };
  if (input.status.scheduled) return { kind: 'scheduled', switchAt: input.status.switchAt };
  if (input.currentPlan !== 'premium') return { kind: 'none' };
  return { kind: 'offer' };
}

export function formatSwitchDate(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(iso));
}

// ── Upgraden naar Premium (ontwerp §8, besluit U-b) ─────────────────────────
//
// Direct Premium; het verschil over de rest van de periode gaat mee met de
// eerstvolgende incasso. Eerst een voorvertoning met het bedrag uit Stripe,
// dan toestemming, dan de wissel met dezelfde `proration_date` — zodat het
// bedrag dat de rijschool zag het bedrag is dat Stripe rekent.

export type UpgradePreview = {
  prorationDate: number;
  inFreePeriod: boolean;
  differenceExclCents: number;
  /** Null als Stripe de btw niet meegaf; dan tonen we alleen excl. btw. */
  differenceInclCents: number | null;
  nextInvoiceAt: string;
};

export type UpgradePreviewResult =
  | { ok: true; preview: UpgradePreview }
  | { ok: false; error: string; kind: 'network' | 'definitive' };

export type UpgradeResult =
  | { ok: true; upgraded: boolean }
  | { ok: false; error: string; kind: 'network' | 'definitive'; reason: string | null };

async function postChangePlan(opts: {
  supabaseUrl: string;
  accessToken: string;
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: true; status: number; data: Record<string, unknown> } | { ok: false }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SWITCH_TIMEOUT_MS);
  try {
    const res = await doFetch(changePlanFunctionUrl(opts.supabaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.accessToken}` },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      // lege/onleesbare body
    }
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function serverError(data: Record<string, unknown>): string {
  return typeof data.error === 'string' && data.error.trim() !== '' ? data.error : GENERIC_SWITCH_ERROR;
}

const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Wat komt erbij, en wanneer? Leest alleen. */
export async function previewUpgrade(opts: {
  supabaseUrl: string;
  accessToken: string;
  schoolId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UpgradePreviewResult> {
  const r = await postChangePlan({ ...opts, body: { school_id: opts.schoolId, action: 'upgrade_preview', plan: 'premium' } });
  if (!r.ok) return { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network' };
  const d = r.data;
  // Alleen een volledig antwoord: zonder bedrag of datum vragen we geen toestemming.
  if (
    r.status !== 200 || d.success !== true
    || !isCents(d.proration_date) || typeof d.in_free_period !== 'boolean'
    || !isCents(d.difference_excl_cents)
    || !(d.difference_incl_cents === null || isCents(d.difference_incl_cents))
    || typeof d.next_invoice_at !== 'string' || Number.isNaN(Date.parse(d.next_invoice_at))
  ) {
    return { ok: false, error: r.status === 200 ? GENERIC_SWITCH_ERROR : serverError(d), kind: 'definitive' };
  }
  return {
    ok: true,
    preview: {
      prorationDate: d.proration_date,
      inFreePeriod: d.in_free_period,
      differenceExclCents: d.difference_excl_cents,
      differenceInclCents: d.difference_incl_cents as number | null,
      nextInvoiceAt: d.next_invoice_at,
    },
  };
}

/** De upgrade zelf, met de `proration_date` van de voorvertoning waarop akkoord is gegeven. */
export async function confirmUpgrade(opts: {
  supabaseUrl: string;
  accessToken: string;
  schoolId: string;
  attemptId: string;
  prorationDate: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UpgradeResult> {
  const r = await postChangePlan({
    ...opts,
    body: { school_id: opts.schoolId, action: 'upgrade', plan: 'premium', attempt_id: opts.attemptId, proration_date: opts.prorationDate },
  });
  if (!r.ok) return { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network', reason: null };
  const d = r.data;
  if (r.status !== 200 || d.success !== true || typeof d.upgraded !== 'boolean') {
    return {
      ok: false,
      error: r.status === 200 ? GENERIC_SWITCH_ERROR : serverError(d),
      kind: 'definitive',
      reason: typeof d.reason === 'string' ? d.reason : null,
    };
  }
  // `upgraded: false` met `already_on_plan` = de school had al Premium.
  return { ok: true, upgraded: d.upgraded };
}

/**
 * De tekst in de bevestiging. Het bedrag komt uit de voorvertoning van
 * Stripe; Ribba rekent niets zelf.
 */
export function upgradeConfirmText(p: UpgradePreview, premiumMonthlyExcl: string, formatCents: (c: number) => string): string {
  const datum = formatSwitchDate(p.nextInvoiceAt);
  if (p.inFreePeriod) {
    return `Je gaat direct over op Premium. In je gratis periode betaal je niets extra. Vanaf ${datum} betaal je ${premiumMonthlyExcl} per maand excl. btw.`;
  }
  if (p.differenceExclCents <= 0) {
    return `Je gaat direct over op Premium. Voor de rest van deze periode komt er niets bij. Vanaf ${datum} betaal je ${premiumMonthlyExcl} per maand excl. btw.`;
  }
  const bedrag = p.differenceInclCents !== null
    ? `${formatCents(p.differenceExclCents)} excl. btw (${formatCents(p.differenceInclCents)} incl. btw)`
    : `${formatCents(p.differenceExclCents)} excl. btw`;
  return `Je gaat direct over op Premium. Voor de rest van deze periode komt er ${bedrag} bij je volgende incasso op ${datum}. Daarna betaal je ${premiumMonthlyExcl} per maand excl. btw.`;
}
