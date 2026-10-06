import { NextRequest } from 'next/server';
import { withSupportAccess, SupportRequestError } from '@/lib/support-auth';
import { isProfile, validateProfileChanges } from '@/lib/support-school-profile';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function GET(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return withSupportAccess(req, { action: 'school.profile.read', level: 0, targetType: 'school', ...(validId(id) ? { targetSchoolId: id } : {}) }, async ({ supabase }) => {
    if (!validId(id)) throw new SupportRequestError('Ongeldige rijschool.', 400);
    const { data, error } = await supabase.rpc('support_school_profile', { p_school_id: id });
    if (error) throw new Error('Schoolgegevens ophalen mislukt');
    if (!data) throw new SupportRequestError('Rijschool niet gevonden.', 404);
    return { profile: data };
  });
}
export async function PATCH(req: NextRequest, context: Context) {
  const { id } = await context.params;
  return withSupportAccess(req, { action: 'school.profile.update.requested', level: 0, targetType: 'school', ...(validId(id) ? { targetSchoolId: id } : {}) }, async ({ supabase, user }) => {
    if (!validId(id)) throw new SupportRequestError('Ongeldige rijschool.', 400);
    const text = await req.text();
    if (text.length > 20_000) throw new SupportRequestError('Te veel gegevens.', 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new SupportRequestError('Ongeldige gegevens.', 400); }
    if (!body || !isProfile(body.expected)) throw new SupportRequestError('Laad de schoolgegevens opnieuw.', 400);
    const { data: current, error } = await supabase.rpc('support_school_profile', { p_school_id: id });
    if (error) throw new Error('Schoolgegevens ophalen mislukt');
    if (!current) throw new SupportRequestError('Rijschool niet gevonden.', 404);
    const checked = validateProfileChanges(current, body.changes);
    if (checked.changes === undefined) throw new SupportRequestError(checked.error, 400);
    const saved = await supabase.rpc('support_update_school_profile', { p_school_id: id, p_actor_id: user.id, p_expected: body.expected, p_changes: checked.changes });
    if (saved.error) throw new Error('Schoolgegevens opslaan mislukt');
    if (saved.data?.status === 'conflict') throw new SupportRequestError('Deze gegevens zijn intussen gewijzigd. Laad opnieuw en controleer je aanpassing.', 409);
    if (saved.data?.status === 'not_found') throw new SupportRequestError('Rijschool niet gevonden.', 404);
    if (saved.data?.status !== 'saved' && saved.data?.status !== 'unchanged') throw new Error('Onbekend opslagresultaat');
    return saved.data;
  });
}
