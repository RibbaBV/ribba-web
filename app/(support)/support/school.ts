export interface School {
  school_id: string;
  school_name: string;
  city: string | null;
  status: string | null;
  is_internal: boolean;
  created_at: string;
  registration_enabled: boolean;
  welcome_email_sent_at: string | null;
  instructeurs: number;
  leerlingen: number;
  lestypes: number;
  beschikbaarheid: number;
  pakketten: number;
  voertuigen: number;
  lessen: number;
  facturen: number;
  abonnement_status: string | null;
  cbr_koppeling: string | null;
  laatste_activiteit: string | null;
  onboarding_gereed: boolean;
}

