import type { SupabaseClient } from '@supabase/supabase-js';

export type SchoolOwners = { status: 'ready'; names: string[] } | { status: 'unavailable' };

function profileName(profile: Record<string, unknown> | null | undefined): string {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  return [text(profile?.first_name), text(profile?.last_name)].filter(Boolean).join(' ')
    || text(profile?.name);
}

/** Read the same Auth name as registration and the app, after the owner gate. */
export async function readSchoolOwners(supabase: SupabaseClient, viewerId: string, schoolId: string): Promise<SchoolOwners | null> {
  let allowed = false;
  try {
    const permission = await supabase.rpc('is_platform_owner', { p_user_id: viewerId });
    if (permission.error || permission.data !== true) return null;
    allowed = true;
    const owners = await supabase.from('instructors').select('user_id')
      .eq('drivingschool_id', schoolId).eq('school_role', 'owner');
    if (owners.error) return { status: 'unavailable' };
    const ids = [...new Set((owners.data ?? []).map(row => row.user_id).filter(Boolean))];
    if (!ids.length) return { status: 'ready', names: [] };
    const names: string[] = [];
    for (const id of ids) {
      // Membership supplies the ID; no email matching or client-supplied owner ID.
      const auth = await supabase.auth.admin.getUserById(id);
      if (auth.error || !auth.data.user || auth.data.user.id !== id) {
        return { status: 'unavailable' };
      }
      const name = profileName(auth.data.user.user_metadata);
      if (name) {
        names.push(name);
        continue;
      }
      // Older accounts may only have a public profile. Never use email as a name.
      const profile = await supabase.from('users').select('first_name,last_name,name')
        .eq('id', id).maybeSingle();
      if (profile.error) return { status: 'unavailable' };
      names.push(profileName(profile.data) || 'Naam niet ingevuld');
    }
    return { status: 'ready', names };
  } catch { return allowed ? { status: 'unavailable' } : null; }
}
