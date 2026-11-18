// Niveau 0 — "Gebruik van de app" voor het supportportaal (10 nov 2026).
//
// Alleen aantallen uit app_events (schermen, knoppen, actieve gebruikers,
// plannen-trechter). Geen personen, dus niveau 0 en voor alle supportmedewerkers,
// niet alleen de eigenaar. Wie erbij mag bepaalt withSupportAccess (sessie +
// tweefactor + platform_staff + logregel); wát er terugkomt bepaalt de
// databasefunctie support_app_gebruik() in ribbaPro.
//
// ?dagen=7|30|90 (standaard 30), ?intern=1 telt ook test- en pilotscholen mee.
// Beide keuzes gaan mee het logboek in.

import { NextRequest } from 'next/server';
import { withSupportAccess, SupportRequestError } from '@/lib/support-auth';
import { parsePeriode } from '@/lib/app-gebruik';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dagen = parsePeriode(url.searchParams.get('dagen'));
  const intern = url.searchParams.get('intern') === '1';

  return withSupportAccess(
    req,
    { action: 'appgebruik.view', level: 0, targetType: 'app_events', meta: { dagen, intern } },
    async ({ supabase }) => {
      const { data, error } = await supabase.rpc('support_app_gebruik', {
        p_dagen: dagen,
        p_school: null,
        p_include_internal: intern,
      });
      if (error || !data) throw new SupportRequestError('Gebruiksgegevens zijn nog niet beschikbaar. Probeer later opnieuw.', 503);
      return data;
    },
  );
}
