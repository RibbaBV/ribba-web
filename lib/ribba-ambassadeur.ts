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

export async function leesCampagne(
  supabase: SupabaseClient,
): Promise<RibbaReferralConfig | null> {
  const { data } = await supabase
    .from('ribba_referral_config')
    .select('status, beloning_cents, attributie_dagen, voorwaarden_versie')
    .maybeSingle();
  return (data as RibbaReferralConfig | null) ?? null;
}
