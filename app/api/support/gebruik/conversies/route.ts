import { NextRequest } from 'next/server';
import { withSupportAccess, SupportRequestError } from '@/lib/support-auth';
import { parsePeriode } from '@/lib/app-gebruik';
import { buildConversionReport, parseSegment } from '@/lib/conversion-metrics';
import { loadConversionSources } from '@/lib/conversion-sources';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
 const url = new URL(req.url), days = parsePeriode(url.searchParams.get('dagen'));
 const segment = parseSegment(url.searchParams.get('doelgroep')), includeInternal = url.searchParams.get('intern') === '1';
 return withSupportAccess(req, { action: 'appconversies.view', level: 0, ownerOnly: true, targetType: 'growth_aggregates', meta: { dagen: days, doelgroep: segment, intern: includeInternal } }, async ({ supabase }) => {
  if (!segment) throw new SupportRequestError('Kies leerlingen of rijscholen.', 400);
  const sources = await loadConversionSources(supabase);
  return buildConversionReport(sources, days, segment, includeInternal);
 });
}
