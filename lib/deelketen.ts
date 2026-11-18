// Deelketen voor zelfstandige leerlingen (18 nov 2026), webkant.
// Ontwerp: ribbaPro docs/design/leerling-deelketen-ontwerp-2026-11-18.md.
// Databasekant: ribbaPro migratie 20261118120000_leerling_deelketen
// (learner_share_codes, learner_share_link_opens, learner_referrals).
//
// Wat deze module doet: de code uit link.ribba.app/s/CODE normaliseren,
// bepalen of een opening geteld mag worden (geen bots of linkpreviews) en
// op welk platform, en de telling wegschrijven. Wat ze bewust niet doet:
// IP-adres, volledige user-agent of iets anders over de bezoeker bewaren.
import { createClient } from '@supabase/supabase-js';

/** Zes tekens zonder 0/O/1/I, exact het patroon van de CHECK in de database. */
export const DEELCODE_PATROON = /^[A-HJ-NP-Z2-9]{6}$/;

export type Platform = 'ios' | 'android' | 'other';

export function normaliseerDeelcode(ruw: unknown): string | null {
  if (typeof ruw !== 'string') return null;
  const code = ruw.trim().toUpperCase();
  return DEELCODE_PATROON.test(code) ? code : null;
}

/** Linkpreviews en crawlers openen de link ook; die tellen niet als vriend. */
const BOT_PATROON = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|twitterbot|telegrambot/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim() === '') return true; // zonder user-agent: geen gewone telefoon
  return BOT_PATROON.test(ua);
}

export function platformUitUserAgent(ua: string | null | undefined): Platform {
  if (!ua) return 'other';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** De deeplink die de app opent als hij geïnstalleerd is (custom scheme). */
export function appDeelLink(code: string): string {
  return `ribba://s/${code}`;
}

export type OpeningResultaat = 'geteld' | 'bot' | 'onbekende_code' | 'fout';

/** Het stukje database dat we nodig hebben; zo blijft het testbaar zonder netwerk. */
export interface DeelketenDb {
  codeBestaat(code: string): Promise<boolean>;
  telOpening(code: string, platform: Platform): Promise<void>;
}

export function deelketenDb(): DeelketenDb {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return {
    async codeBestaat(code) {
      const { data, error } = await supabase
        .from('learner_share_codes').select('code').eq('code', code).maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async telOpening(code, platform) {
      const { error } = await supabase.from('learner_share_link_opens').insert({ code, platform });
      if (error) throw error;
    },
  };
}

/**
 * Eén opening registreren. Geeft terug wat er gebeurde zodat de pagina kan
 * kiezen wat ze toont; gooit nooit — een telfout mag de pagina niet breken.
 */
export async function registreerLinkOpening(
  code: string,
  userAgent: string | null | undefined,
  db: DeelketenDb,
): Promise<OpeningResultaat> {
  try {
    if (!(await db.codeBestaat(code))) return 'onbekende_code';
    if (isBotUserAgent(userAgent)) return 'bot';
    await db.telOpening(code, platformUitUserAgent(userAgent));
    return 'geteld';
  } catch (e) {
    console.error('deelketen: opening niet geteld', e instanceof Error ? e.message : e);
    return 'fout';
  }
}
