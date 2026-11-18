// Tegoedlogboek in het supportportaal (stap 3, 12 nov 2026).
//
// Alleen de eigenaar, niveau 2: naam, e-mailadres en tegoed van een leerling.
// withSupportAccess dwingt sessie, tweefactor, eigenaarschap, inzagereden en
// een regel in platform_access_log af; de databasefuncties controleren de
// eigenaar nog een keer. Zoekterm en leerling-id staan in de POST-body, zodat
// ze niet in URL's of serverlogs belanden.

import { NextRequest } from 'next/server';
import { withSupportAccess, SupportRequestError } from '@/lib/support-auth';
import { LIMIET, parseTegoedVerzoek } from '@/lib/tegoed-logboek';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const input = parseTegoedVerzoek(await req.json().catch(() => null));

  if (input?.modus === 'logboek') {
    return withSupportAccess(
      req,
      { action: 'owner.tegoed.read', ownerOnly: true, level: 2, reason: input.reason, targetType: 'student_credit', targetStudentId: input.student_id },
      async ({ supabase, user }) => {
        const { data, error } = await supabase.rpc('support_tegoed_logboek', { p_actor: user.id, p_student: input.student_id, p_limit: LIMIET });
        if (error) throw new SupportRequestError('Het tegoedlogboek kan niet worden geladen. Probeer later opnieuw.', 503);
        if (!data) throw new SupportRequestError('Deze leerling bestaat niet (meer).', 404);
        return data;
      },
    );
  }

  return withSupportAccess(
    req,
    { action: 'owner.tegoed.search', ownerOnly: true, level: 2, reason: input?.reason, targetType: 'student_credit' },
    async ({ supabase, user }) => {
      if (!input) throw new SupportRequestError('Vul een zoekterm (minimaal 2 tekens) en een inzagereden (minimaal 10 tekens) in.', 400);
      const { data, error } = await supabase.rpc('support_tegoed_zoek', { p_actor: user.id, p_query: input.query });
      if (error || !data) throw new SupportRequestError('Zoeken lukt nu niet. Probeer later opnieuw.', 503);
      return data;
    },
  );
}
