// Gedeelde MFA-termijn. Alleen de server mag hier toegang op baseren, nadat
// getUser het token heeft geverifieerd; in de browser is dit uitsluitend UX.
export const SUPPORT_MFA_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Absolute deadline vanaf de laatste TOTP-verificatie, nooit vanaf tokenverversing. */
export function supportMfaDeadline(token: string, now = Date.now()): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (claims?.aal !== 'aal2' || !Array.isArray(claims.amr)) return null;
    const timestamps = claims.amr
      .filter((entry: { method?: unknown; timestamp?: unknown } | null) =>
        entry?.method === 'totp' && typeof entry.timestamp === 'number' &&
        Number.isSafeInteger(entry.timestamp) && entry.timestamp > 0 &&
        entry.timestamp * 1000 <= now + 60_000)
      .map((entry: { timestamp: number }) => entry.timestamp);
    if (!timestamps.length) return null;
    return (Math.max(...timestamps) + SUPPORT_MFA_MAX_AGE_SECONDS) * 1000;
  } catch {
    return null;
  }
}

export function hasFreshSupportMfa(token: string, now = Date.now()): boolean {
  const deadline = supportMfaDeadline(token, now);
  return deadline !== null && now < deadline;
}
