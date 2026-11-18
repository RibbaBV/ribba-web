// Dagelijkse opvolging van inschrijvingen die bij Checkout zijn blijven hangen.
// Zie lib/signup-opvolging.ts voor het waarom en de regels (24 u / 48 u / 7 d).
//
// Auth: Vercel Cron stuurt `Authorization: Bearer ${CRON_SECRET}`.
//
// Volgorde per rij: eerst de mail, dan de kolom zetten. Mislukt de mail, dan
// blijft de kolom leeg en probeert de cron het morgen opnieuw. Mislukt het
// zetten van de kolom ná een gelukte mail, dan kan er morgen een tweede mail
// gaan; dat is de minder erge fout van de twee en wordt gelogd.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendAdminNotification } from '@/lib/admin-notifications';
import {
  herinneringMail,
  selecteerOpvolging,
  teamOpvolgingInfo,
  VENSTER_DAGEN,
  type PendingRij,
} from '@/lib/signup-opvolging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function stuurHerinnering(rij: PendingRij): Promise<void> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY ontbreekt');
  const { subject, html } = herinneringMail(rij);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Ribba <noreply@ribba.nl>', to: rij.email, subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${tekst.slice(0, 200)}`);
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const nu = new Date();
  const vanaf = new Date(nu.getTime() - VENSTER_DAGEN * 24 * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from('pending_registrations')
    .select('id, status, school_name, first_name, last_name, email, phone, city, plan, promo_code, created_at, reminder_sent_at, followup_notified_at, signup_attribution')
    .eq('status', 'pending_checkout')
    .gte('created_at', vanaf);
  if (error) {
    console.error('signup-reminders: query mislukt', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const { herinneren, team } = selecteerOpvolging((data ?? []) as PendingRij[], nu);
  const herinnerd: string[] = [];
  const gemeld: string[] = [];
  const mislukt: Array<{ id: string; stap: string; reden: string }> = [];

  for (const rij of herinneren) {
    try {
      await stuurHerinnering(rij);
      const { error: upd } = await supabase
        .from('pending_registrations')
        .update({ reminder_sent_at: nu.toISOString() })
        .eq('id', rij.id)
        .eq('status', 'pending_checkout');
      if (upd) {
        console.error('signup-reminders: reminder_sent_at niet gezet', rij.id, upd);
        mislukt.push({ id: rij.id, stap: 'reminder_sent_at', reden: upd.message });
      }
      herinnerd.push(rij.id);
    } catch (e) {
      mislukt.push({ id: rij.id, stap: 'herinnering', reden: String(e).slice(0, 200) });
      console.error('signup-reminders: herinnering mislukt', rij.id, e);
    }
  }

  for (const rij of team) {
    // De melding leest reminder_sent_at; is die zojuist gezet, dan staat hij
    // nog niet in `rij`. Vul hem bij zodat de teammail klopt.
    const bijgewerkt = herinnerd.includes(rij.id) ? { ...rij, reminder_sent_at: nu.toISOString() } : rij;
    // sendAdminNotification vangt zelf elke fout af en gooit nooit.
    await sendAdminNotification('signup_abandoned', teamOpvolgingInfo(bijgewerkt, nu));
    const { error: upd } = await supabase
      .from('pending_registrations')
      .update({ followup_notified_at: nu.toISOString() })
      .eq('id', rij.id)
      .eq('status', 'pending_checkout');
    if (upd) {
      console.error('signup-reminders: followup_notified_at niet gezet', rij.id, upd);
      mislukt.push({ id: rij.id, stap: 'followup_notified_at', reden: upd.message });
    }
    gemeld.push(rij.id);
  }

  return NextResponse.json({
    bekeken: data?.length ?? 0,
    herinnerd_count: herinnerd.length,
    gemeld_count: gemeld.length,
    mislukt_count: mislukt.length,
    herinnerd, gemeld, mislukt,
  });
}
