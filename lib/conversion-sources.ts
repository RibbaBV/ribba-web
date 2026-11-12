/** Server-only bronlezer. Geen leerlinginhoud/contactvelden; de API geeft alleen aggregaten terug. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountRow, AppEventRow, ConversionSources, ReceiptRow, ReferralRow, SchoolRow, StudentLinkRow, SourceState } from './conversion-metrics';
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;
export type PageResult = { data: unknown[] | null; error: unknown };
/** Een harde limiet wordt nooit stil als een volledige populatie getoond. */
export async function readCompletePages<T>(read: (from: number, to: number) => PromiseLike<PageResult>): Promise<{ rows: T[]; state: SourceState }> {
 const rows: T[] = [];
 try {
  for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
   const page = await read(from, from + PAGE_SIZE - 1);
   if (page.error || !Array.isArray(page.data)) return { rows: [], state: { status: 'unavailable', reason: 'Bron kon niet volledig worden gelezen.' } };
   if (from === MAX_ROWS && page.data.length) return { rows: [], state: { status: 'truncated', reason: 'Meer dan 50.000 bronrecords; een databaseaggregaat is nodig.' } };
   rows.push(...page.data as T[]);
   if (page.data.length < PAGE_SIZE) return { rows, state: { status: 'ready' } };
  }
 } catch { return { rows: [], state: { status: 'unavailable', reason: 'Bron kon niet volledig worden gelezen.' } }; }
 return { rows: [], state: { status: 'truncated', reason: 'De bron overschrijdt de leesgrens.' } };
}
export async function loadConversionSources(supabase: SupabaseClient, now = new Date()): Promise<ConversionSources> {
 const capturedAt = now.toISOString(), since = new Date(now.getTime() - 90 * 86400000).toISOString();
 const [events, accounts, schools, links, receipts, referrals] = await Promise.all([
  readCompletePages<AppEventRow>((from, to) => supabase.from('app_events').select('id,ontvangen_op,user_id,rol,school_id,soort,scherm,element,ota_id,sessie_id').gte('ontvangen_op', since).lte('ontvangen_op', capturedAt).order('id').range(from,to)),
  readCompletePages<AccountRow>((from, to) => supabase.from('users').select('id,role,created_at').lte('created_at',capturedAt).order('id').range(from,to)),
  readCompletePages<SchoolRow>((from, to) => supabase.from('drivingschools').select('id,is_internal,created_at').lte('created_at',capturedAt).order('id').range(from,to)),
  readCompletePages<StudentLinkRow>((from, to) => supabase.from('students').select('user_id,drivingschool_id').not('user_id','is',null).order('id').range(from,to)),
  readCompletePages<ReceiptRow>((from, to) => supabase.from('billing_webhook_receipts').select('id,school_id,provider,event_kind,status,side_effect_stage,first_received_at,external_event_id').lte('first_received_at',capturedAt).order('id').range(from,to)),
  readCompletePages<ReferralRow>((from, to) => supabase.from('ribba_referrals').select('id,school_id,aangemeld_op,verdiend_op,void_op').lte('aangemeld_op',capturedAt).order('id').range(from,to)),
 ]);
 return { capturedAt, events: events.rows, accounts: accounts.rows, schools: schools.rows, links: links.rows, receipts: receipts.rows, referrals: referrals.rows,
  states: { events: events.state, accounts: accounts.state, schools: schools.state, links: links.state, receipts: receipts.state, referrals: referrals.state } };
}
