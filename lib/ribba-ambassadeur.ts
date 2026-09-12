// Serverkant van het ambassadeursprogramma: codegeneratie en de campagne.
// Gedeeld door /api/ambassadeur/* en de payout-cron.

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RibbaReferralConfig } from '@/lib/ribba-ambassadeur-types';

// Zonder 0/O/1/I: codes worden overgetypt en voorgelezen.
const CODE_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTE = 8;

export function genereerCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTE; i++) {
    code += CODE_ALFABET[randomInt(CODE_ALFABET.length)];
  }
  return code;
}

/**
 * Is deze beloning uit de wachttijd?
 *
 * Twee randgevallen zitten hier bewust in, en allebei omdat ze geld kosten als
 * ze omklappen. `null` telt als vrij: dat zijn de rijen van vóór de wachttijd,
 * en die mogen niet vast komen te staan. En het moment zelf telt als vrij, want
 * een beloning die "klaar op 11 oktober" heet moet op 11 oktober te innen zijn.
 *
 * De innen-route doet deze toets nogmaals in SQL, in dezelfde UPDATE als de
 * statuswissel. Deze functie is voor wat het scherm toont; die voor wat er
 * gebeurt.
 */
export function beloningIsVrij(vrijOp: string | null, nu: Date = new Date()): boolean {
  if (vrijOp === null) return true;
  const moment = new Date(vrijOp).getTime();
  if (Number.isNaN(moment)) return true; // onleesbare datum houdt niemand tegen
  return moment <= nu.getTime();
}

export async function leesCampagne(
  supabase: SupabaseClient,
): Promise<RibbaReferralConfig | null> {
  const { data } = await supabase
    .from('ribba_referral_config')
    .select('status, beloning_cents, attributie_dagen, wachttijd_dagen, voorwaarden_versie')
    .maybeSingle();
  return (data as RibbaReferralConfig | null) ?? null;
}
