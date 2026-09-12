// Handgeschreven row-types voor het ambassadeursprogramma
// (ribbaPro: supabase/migrations/20260911090000_ribba_ambassadeurs.sql).
// Het gedeelde Supabase-project is niet CLI-gelinkt vanuit deze repo, dus
// geen `supabase gen types` — houd dit bestand in sync met de migratie.

export type AmbassadeurStatus = 'active' | 'disabled';

export type TipStatus =
  | 'aangemeld' // rijschool ingeschreven via de tip, nog niet betaald
  | 'verdiend'  // eerste betaling binnen, er staat geld klaar
  | 'void';     // ingetrokken (dubbel, fraude, ops-correctie)

export type UitbetalingStatus =
  | 'te_innen'    // verdiend; te innen zodra vrij_op is gepasseerd
  | 'geclaimd'    // ambassadeur klikte "innen"; de cron maakt de transfer
  | 'uitbetaald'  // transfer aangemaakt, geld onderweg
  | 'mislukt'     // transfer mislukt; opnieuw te innen na herstel
  | 'geannuleerd';

export interface RibbaReferralConfig {
  status: 'active' | 'paused';
  beloning_cents: number;
  attributie_dagen: number;
  /** Dagen tussen verdienen en innen. Beschermt tegen de geld-terug-garantie. */
  wachttijd_dagen: number;
  voorwaarden_versie: string;
}

export interface AmbassadeurRow {
  id: string;
  partner_id: string;
  code: string;
  status: AmbassadeurStatus;
  akkoord_versie: string;
  akkoord_op: string;
  created_at: string;
}

export interface TipRow {
  id: string;
  ambassadeur_id: string;
  code: string;
  pending_registration_id: string | null;
  school_id: string | null;
  school_naam: string;
  status: TipStatus;
  beloning_cents: number;
  aangemeld_op: string;
  verdiend_op: string | null;
  void_op: string | null;
  void_reden: string | null;
  created_at: string;
}

export interface UitbetalingRow {
  id: string;
  referral_id: string;
  ambassadeur_id: string;
  partner_id: string;
  amount_cents: number;
  currency: string;
  status: UitbetalingStatus;
  /** Vanaf wanneer te innen. Null op rijen van vóór de wachttijd. */
  vrij_op: string | null;
  stripe_transfer_id: string | null;
  verdiend_mail_op: string | null;
  geclaimd_op: string | null;
  uitbetaald_op: string | null;
  mislukt_op: string | null;
  mislukking_reden: string | null;
  poging_aantal: number;
  created_at: string;
}
