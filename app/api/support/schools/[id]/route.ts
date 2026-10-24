// Niveau 0 — detail van één rijschool: profiel, onboardingstappen en de
// gebeurtenissentijdlijn.
//
// Twee databasefuncties in één antwoord, met alleen voor de platformeigenaar
// een aanvullende naamlookup van de eigenaaraccounts van deze school. Wat
// niveau 0 is bepalen die functies; deze route voegt alleen samen. De school
// gaat mee in de logregel, want "welke klant heb je bekeken" is precies wat
// een toegangslogboek moet vastleggen.

import { NextRequest } from 'next/server';
import { withSupportAccess } from '@/lib/support-auth';
import { readSchoolOwners } from '@/lib/support-school-owner';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return withSupportAccess(
    req,
    { action: 'school.detail', level: 0, targetType: 'school', targetSchoolId: id },
    async ({ supabase, user }) => {
      const [detail, events] = await Promise.all([
        supabase.rpc('support_school_detail', { p_school_id: id }),
        supabase.rpc('support_school_events', { p_school_id: id, p_limit: 100 }),
      ]);
      if (detail.error) throw new Error(detail.error.message);
      if (events.error) throw new Error(events.error.message);
      if (!detail.data) throw new Error('Rijschool niet gevonden');

      const owners = await readSchoolOwners(supabase, user.id, id);
      return { detail: { ...detail.data, ...(owners ? { owners } : {}) }, events: events.data ?? [] };
    },
  );
}
