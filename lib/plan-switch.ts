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
}): Promise<PlanSwitchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const body: Record<string, string> = { school_id: opts.schoolId, action: opts.action };
  if (opts.action === 'schedule') {
    body.plan = 'basic';
    if (opts.attemptId) body.attempt_id = opts.attemptId;
  }

  let res: Response;
  try {
    res = await doFetch(changePlanFunctionUrl(opts.supabaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_SWITCH_ERROR, kind: 'network' };
  }

  let data: { success?: unknown; scheduled?: unknown; switch_at?: unknown; error?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    // lege/onleesbare body → generieke melding hieronder
  }

  if (!res.ok || data.success !== true) {
    const serverError = typeof data.error === 'string' && data.error.trim() !== ''
      ? data.error
      : GENERIC_SWITCH_ERROR;
    return { ok: false, error: serverError, kind: 'definitive' };
  }
  return {
    ok: true,
    scheduled: data.scheduled === true,
    switchAt: typeof data.switch_at === 'string' ? data.switch_at : null,
  };
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
