export interface SupportEvent {
  wanneer: string | null;
  bron: string;
  soort: string;
  ok: boolean;
  detail: string | null;
}

/** Alleen een latere geslaagde run van hetzelfde CBR-type bewijst herstel.
 * De beperkte tijdlijn kan bewijs missen: dan blijft de oorspronkelijke fout staan.
 */
export function withCbrRecovery(events: SupportEvent[]) {
  return events.map(event => {
    const failedAt = event.wanneer ? Date.parse(event.wanneer) : NaN;
    const recovery = event.bron === 'cbr' && !event.ok && Number.isFinite(failedAt)
      ? events.filter(candidate => candidate.bron === 'cbr' && candidate.soort === event.soort
          && candidate.ok && candidate.wanneer && Date.parse(candidate.wanneer) > failedAt)
        .sort((a, b) => Date.parse(a.wanneer!) - Date.parse(b.wanneer!))[0]
      : undefined;
    return { ...event, hersteldOp: recovery?.wanneer ?? null };
  });
}
