import { getCountryProfile, isValidBusinessRegisterFor, isValidPhoneFor, isValidPostcodeFor, isValidVatFor, normalizeBusinessRegister, normalizePostcode, normalizeVat } from './country-profile';
import { isValidEmail, isValidIBAN } from '../utils/validation';

export const PROFILE_FIELDS = ['name', 'email', 'phone', 'address', 'postal_code', 'city', 'kvk_number', 'btw_number', 'iban', 'legal_name', 'billing_address', 'billing_postal_code', 'billing_city'] as const;
export type ProfileField = typeof PROFILE_FIELDS[number];
export type SchoolProfile = Record<ProfileField, string | null> & { country_code: string | null; legal_form: string | null };
export const PROFILE_LABELS: Record<ProfileField, string> = {
  name: 'Rijschoolnaam', email: 'E-mailadres van de rijschool', phone: 'Telefoonnummer', address: 'Adres', postal_code: 'Postcode', city: 'Plaats', kvk_number: 'KvK-nummer', btw_number: 'Btw-nummer', iban: 'IBAN', legal_name: 'Statutaire naam', billing_address: 'Afwijkend vestigingsadres', billing_postal_code: 'Postcode vestiging', billing_city: 'Plaats vestiging',
};
export function isProfile(value: unknown): value is SchoolProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const keys = [...PROFILE_FIELDS, 'country_code', 'legal_form'];
  return Object.keys(obj).length === keys.length && keys.every(k => Object.hasOwn(obj, k) && (obj[k] === null || typeof obj[k] === 'string'));
}
// Bestaande vormcontrole + controlegetal, zonder een bank- of rekeningcontrole te suggereren.
export function validSupportIban(value: string): boolean {
  if (!isValidIBAN(value)) return false;
  const s = value.replace(/\s/g, '').toUpperCase();
  if (s.startsWith('NL') && !/^NL\d{2}[A-Z]{4}\d{10}$/.test(s)) return false;
  let remainder = 0;
  for (const c of s.slice(4) + s.slice(0, 4)) {
    for (const d of (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}
export function validateProfileChanges(current: SchoolProfile, input: unknown): { changes: Partial<SchoolProfile>; error?: never } | { error: string; changes?: never } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Ongeldige gegevens.' };
  const changes: Partial<SchoolProfile> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!PROFILE_FIELDS.includes(key as ProfileField)) return { error: 'Dit veld kan hier niet worden gewijzigd.' };
    if (raw !== null && typeof raw !== 'string') return { error: 'Vul tekst in.' };
    if (typeof raw === 'string' && (raw.length > 320 || /[\u0000-\u001f\u007f]/.test(raw))) return { error: 'Een veld bevat ongeldige of te lange tekst.' };
    let v = typeof raw === 'string' ? raw.trim() : '';
    if (key === 'iban') v = v.replace(/\s/g, '').toUpperCase();
    if (key.endsWith('postal_code')) v = normalizePostcode(v);
    if (key === 'btw_number') v = normalizeVat(v);
    if (key === 'kvk_number') v = normalizeBusinessRegister(v);
    if (key === 'email') v = v.toLowerCase();
    if ((v || null) !== current[key as ProfileField]) changes[key as ProfileField] = v || null;
  }
  const next = { ...current, ...changes };
  const profile = getCountryProfile(current.country_code);
  for (const key of Object.keys(changes) as ProfileField[]) {
    const v = next[key];
    if (['name', 'email', 'phone', 'address', 'postal_code', 'city', 'kvk_number'].includes(key) && !v) return { error: `${PROFILE_LABELS[key]} mag niet leeg zijn.` };
    if (v && key === 'email' && !isValidEmail(v)) return { error: 'Vul een geldig e-mailadres in.' };
    if (v && key === 'iban' && !validSupportIban(v)) return { error: 'Controleer het IBAN; het formaat of controlegetal klopt niet.' };
    if (v && ['phone', 'postal_code', 'billing_postal_code', 'kvk_number', 'btw_number'].includes(key)) {
      if (!profile) return { error: 'Voor dit land zijn de invoerregels nog niet beschikbaar.' };
      const valid = key === 'phone' ? isValidPhoneFor(profile, v) : key.endsWith('postal_code') ? isValidPostcodeFor(profile, v) : key === 'kvk_number' ? isValidBusinessRegisterFor(profile, v) : isValidVatFor(profile, v);
      if (!valid) return { error: `Controleer ${PROFILE_LABELS[key].toLowerCase()}.` };
    }
  }
  if (Object.hasOwn(changes, 'legal_name') && current.legal_form === 'bv' && !next.legal_name) return { error: 'Een BV heeft een statutaire naam nodig.' };
  if (['billing_address', 'billing_postal_code', 'billing_city'].some(k => Object.hasOwn(changes, k))) {
    const count = [next.billing_address, next.billing_postal_code, next.billing_city].filter(Boolean).length;
    if (count !== 0 && (count !== 3 || current.legal_form !== 'bv')) return { error: 'Vul voor een BV het volledige vestigingsadres in, of laat alle drie velden leeg.' };
  }
  return { changes };
}
