// Server-side leesroute voor de proefles-pagina's. Alleen de bekijk-RPC's:
// een GET op een tokenpagina muteert nooit (mailscanners openen elke link).

import { getServiceClient } from '@/lib/marketplace-db';
import { isProeflesToken } from '@/lib/proefles';

export type Gelezen<T> = { ok: true; data: T } | { ok: false; reden: 'ongeldig' | 'fout' };

type BekijkRpc = 'proefles_bevestiging_bekijken' | 'proefles_leerling_bekijken' | 'proefles_aanbod_bekijken';

export async function bekijkProefles<T>(rpc: BekijkRpc, token: string): Promise<Gelezen<T>> {
  if (!isProeflesToken(token)) return { ok: false, reden: 'ongeldig' };
  try {
    const { data, error } = await getServiceClient().rpc(rpc, { p_token: token });
    if (error) throw error;
    return { ok: true, data: data as T };
  } catch (err) {
    console.error(`[proefles] ${rpc} faalde:`, err);
    return { ok: false, reden: 'fout' };
  }
}
