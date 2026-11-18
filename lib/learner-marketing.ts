export type MarketingStatus = 'unknown' | 'granted' | 'declined' | 'withdrawn';
export const marketingLabels: Record<MarketingStatus,string> = {
  unknown:'Nog geen centrale keuze', granted:'Toestemming gegeven', declined:'Geen toestemming', withdrawn:'Toestemming ingetrokken',
};
export interface MarketingSummary {
  captured_at:string;
  sending_enabled:false;
  groups:{scope:'all'|'none';accounts:number;not_asked:number;granted:number;declined:number;withdrawn:number;eligible:number;age_or_profile_blocked:number;legacy_unconfirmed:number}[];
}
