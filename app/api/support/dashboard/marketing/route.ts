import {NextRequest} from 'next/server';
import {withSupportAccess, SupportRequestError} from '@/lib/support-auth';
export const dynamic = 'force-dynamic';
/** Aggregate-only preparation; never enqueues or sends a campaign. */
export async function GET(req: NextRequest) {
  return withSupportAccess(req, {action:'owner.marketing.summary', ownerOnly:true, level:0}, async ({supabase, user}) => {
    const {data, error} = await supabase.rpc('owner_learner_marketing_summary', {p_actor:user.id});
    if (error || !data) throw new SupportRequestError('Marketingvoorkeuren zijn nog niet beschikbaar. Probeer later opnieuw.', 503);
    return data;
  });
}
