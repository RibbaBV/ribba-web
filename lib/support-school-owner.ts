import type { SupabaseClient } from '@supabase/supabase-js';

export type SchoolOwners = { status: 'ready'; names: string[] } | { status: 'unavailable' };

/** Names are returned only after a server-side platform-owner check. */
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
    const profiles = await supabase.from('users').select('id,first_name,last_name,name').in('id', ids);
    if (profiles.error) return { status: 'unavailable' };
    const names = ids.map(id => {
      const profile = profiles.data?.find(row => row.id === id);
      return [profile?.first_name?.trim(), profile?.last_name?.trim()].filter(Boolean).join(' ') || profile?.name?.trim() || 'Naam niet ingevuld';
    });
    return { status: 'ready', names };
  } catch { return allowed ? { status: 'unavailable' } : null; }
}
