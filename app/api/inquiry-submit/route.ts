// Inquiry-intake vanaf de vergelijkingssite (ribba.app, statisch — POST
// cross-origin hierheen) én sinds F2-4a vanuit de Ribba-app. Maakt 1
// inquiries-rij + N inquiry_recipients aan en stuurt outreach-mails naar de
// geselecteerde rijscholen (na de response, via after()). Issue ribba.app#33.
//
// INGELOGDE APP-GEBRUIKER (F2-4a, 25 sep 2026)
// De app stuurt een `Authorization: Bearer <access_token>` mee. Is die geldig,
// dan:
//   - wint het e-mailadres van het account boven wat de client stuurt — anders
//     zou claim_inquiry (gelijk e-mailadres) falen en gaan de mails naar een
//     ander adres dan de leerling zelf;
//   - is de rate-limit per gebruiker in plaats van per IP (mobiel zit vaak
//     achter carrier-NAT: één IP voor duizenden toestellen);
//   - wordt source_page 'app';
//   - wordt ná de RPC inquiries.leerling_user_id gezet, zodat get_my_inquiries
//     (Mijn aanvragen in de app) de aanvraag meteen ziet.
// Een ongeldige bearer is 401. Zonder bearer verandert er niets: de site
// werkt zoals voorheen. De DB-poort (submit_inquiry) blijft service_role-only;
// dit endpoint is de enige intake voor site én app, en de enige plek die mailt.

import { NextRequest, NextResponse, after } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { isValidEmail, isValidInternationalPhone } from '@/utils/validation';
import { corsHeaders, corsPreflight } from '@/lib/cors';
import { getServiceClient, getCbrRijscholen } from '@/lib/marketplace-db';
import { sendRijschoolOutreachMail, sendLeerlingBevestigingMail } from '@/lib/marketplace-emails';

export const maxDuration = 60;

const RIJBEWIJS_CATEGORIEEN = ['B', 'AM', 'A', 'BE', 'C', 'CE', 'D', 'DE', 'T'];
const SCHAKELINGEN = ['handgeschakeld', 'automaat', 'beide'];
const MAX_RECIPIENTS = 10;

export async function OPTIONS(request: NextRequest) {
  return corsPreflight(request.headers.get('origin'));
}

type AppUser = { id: string; email: string };

/** Geldige bearer → de ingelogde gebruiker; geen bearer → null; ongeldig → 'ongeldig'. */
async function appUserFromBearer(request: NextRequest): Promise<AppUser | null | 'ongeldig'> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return 'ongeldig';
  const { data, error } = await getServiceClient().auth.getUser(token);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !data?.user?.id || !email) return 'ongeldig';
  return { id: data.user.id, email };
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  const appUser = await appUserFromBearer(request);
  if (appUser === 'ongeldig') {
    return NextResponse.json({ error: 'Ongeldige sessie.' }, { status: 401, headers });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rateKey = appUser ? `inquiry:user:${appUser.id}` : `inquiry:${ip}`;
  if (!rateLimit(rateKey, { maxRequests: 5, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: 'Te veel aanvragen. Probeer het over een uur opnieuw.' },
      { status: 429, headers },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige request body.' }, { status: 400, headers });
  }

  // Honeypot: verborgen veld dat de ContactForm meestuurt. Gevuld → bot.
  // Antwoord identiek aan een echte submit zodat bots niets leren.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    const fakeCount = Array.isArray(body.rijschool_ids)
      ? Math.min(body.rijschool_ids.length, MAX_RECIPIENTS)
      : 1;
    return NextResponse.json(
      { inquiry_id: crypto.randomUUID(), recipients_count: fakeCount },
      { status: 201, headers },
    );
  }

  const leerlingName = typeof body.leerling_name === 'string' ? body.leerling_name.trim() : '';
  // Ingelogd: het account-e-mailadres, niet wat de client stuurt.
  const leerlingEmail = appUser
    ? appUser.email
    : typeof body.leerling_email === 'string' ? body.leerling_email.trim().toLowerCase() : '';
  const leerlingPhone = typeof body.leerling_phone === 'string' && body.leerling_phone.trim() !== ''
    ? body.leerling_phone.trim()
    : null;
  const categorie = body.rijbewijs_categorie;
  const schakeling = body.schakeling ?? null;
  // Mag client-side gesynthetiseerd zijn: de ContactForm vertaalt zsm/+1m/+3m
  // naar een concrete datum en "later" naar null.
  const startdatum = typeof body.gewenste_startdatum === 'string' && body.gewenste_startdatum !== ''
    ? body.gewenste_startdatum
    : null;
  const marketingOptin = body.marketing_optin === true;
  const opleidingsvoorkeur = typeof body.opleidingsvoorkeur === 'string' && body.opleidingsvoorkeur.trim() !== ''
    ? body.opleidingsvoorkeur.trim().slice(0, 500)
    : null;
  const bericht = typeof body.bericht === 'string' && body.bericht.trim() !== ''
    ? body.bericht.trim().slice(0, 2000)
    : null;
  const sourcePage = appUser
    ? 'app'
    : typeof body.source_page === 'string' ? body.source_page.slice(0, 500) : null;

  if (!leerlingName || leerlingName.length > 120) {
    return NextResponse.json({ error: 'Naam is verplicht.' }, { status: 400, headers });
  }
  if (!isValidEmail(leerlingEmail)) {
    return NextResponse.json({ error: 'Ongeldig e-mailadres.' }, { status: 400, headers });
  }
  if (leerlingPhone && !isValidInternationalPhone(leerlingPhone)) {
    return NextResponse.json({ error: 'Ongeldig telefoonnummer.' }, { status: 400, headers });
  }
  if (typeof categorie !== 'string' || !RIJBEWIJS_CATEGORIEEN.includes(categorie)) {
    return NextResponse.json({ error: 'Ongeldige rijbewijscategorie.' }, { status: 400, headers });
  }
  if (schakeling !== null && (typeof schakeling !== 'string' || !SCHAKELINGEN.includes(schakeling))) {
    return NextResponse.json({ error: 'Ongeldige schakeling.' }, { status: 400, headers });
  }
  if (startdatum !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(startdatum) || isNaN(Date.parse(startdatum)))) {
    return NextResponse.json({ error: 'Ongeldige startdatum.' }, { status: 400, headers });
  }
  if (body.toestemming !== true) {
    return NextResponse.json(
      { error: 'Akkoord met het doorsturen van je aanvraag is verplicht.' },
      { status: 400, headers },
    );
  }

  const rawIds = Array.isArray(body.rijschool_ids) ? body.rijschool_ids : null;
  if (!rawIds || rawIds.length === 0) {
    return NextResponse.json({ error: 'Selecteer minimaal één rijschool.' }, { status: 400, headers });
  }
  const rijschoolIds = [...new Set(rawIds)].filter(
    (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0,
  );
  if (rijschoolIds.length === 0 || rijschoolIds.length !== rawIds.length || rijschoolIds.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Ongeldige rijschool-selectie (1 t/m ${MAX_RECIPIENTS} rijscholen).` },
      { status: 400, headers },
    );
  }

  try {
    const schools = await getCbrRijscholen(rijschoolIds);
    if (schools.length !== rijschoolIds.length) {
      return NextResponse.json({ error: 'Eén of meer rijscholen zijn onbekend.' }, { status: 400, headers });
    }

    const supabase = getServiceClient();

    // Intake + 24u-dedupe transactioneel via RPC: een advisory lock op het
    // e-mailadres voorkomt de TOCTOU-race waarbij twee gelijktijdige submits
    // (dubbelklik/tabs) beide de dedupe passeren en dubbele outreach sturen.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_inquiry', {
      p_leerling: {
        leerling_name: leerlingName,
        leerling_email: leerlingEmail,
        leerling_phone: leerlingPhone,
        rijbewijs_categorie: categorie,
        schakeling,
        gewenste_startdatum: startdatum,
        opleidingsvoorkeur,
        bericht,
        source_page: sourcePage,
        marketing_optin: marketingOptin,
      },
      p_rijschool_ids: rijschoolIds,
    });

    if (rpcError || !rpcResult) {
      console.error('inquiry-submit: submit_inquiry rpc failed', rpcError);
      return NextResponse.json(
        { error: 'Er ging iets mis bij het opslaan. Probeer het opnieuw.' },
        { status: 500, headers },
      );
    }

    const inquiryId: string | null = rpcResult.inquiry_id;
    const recipients: Array<{ id: string; rijschool_id: number; rijschool_chat_token: string }> =
      rpcResult.recipients ?? [];

    if (!inquiryId || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Je hebt deze rijscholen de afgelopen 24 uur al een aanvraag gestuurd.' },
        { status: 409, headers },
      );
    }

    // Koppel de aanvraag aan het account vóór de response, zodat Mijn
    // aanvragen hem direct toont. Mislukt dit, dan is de aanvraag wél gemaakt
    // en gaan de mails wél; de app kan hem alsnog claimen via claim_inquiry
    // (zelfde e-mailadres), dus dit is geen reden voor een 500.
    if (appUser) {
      const { error: koppelError } = await supabase
        .from('inquiries')
        .update({ leerling_user_id: appUser.id })
        .eq('id', inquiryId);
      if (koppelError) {
        console.error('inquiry-submit: leerling_user_id koppelen mislukt', inquiryId, koppelError);
      }
    }

    // Outreach + leerling-bevestiging ná de response: de leerling hoeft niet
    // op 10+ Resend-calls te wachten. Eén mislukte mail laat de recipient op
    // 'pending' staan; de notificatie-cron sweept die en probeert opnieuw.
    after(async () => {
      const schoolById = new Map(schools.map((s) => [s.id, s]));

      // Bevestigingsmail naar de leerling: verwachtingen zetten + het eerste
      // contactmoment (warmt de mailbox op vóór de reply-notificaties).
      // Alleen scholen mét e-mailadres beloven: no-email-scholen worden nooit
      // gecontacteerd en kunnen structureel niet reageren.
      try {
        const emailableNames = recipients
          .map((r) => schoolById.get(r.rijschool_id))
          .filter((s): s is NonNullable<typeof s> => !!s?.email)
          .map((s) => s.name);
        if (emailableNames.length > 0) {
          await sendLeerlingBevestigingMail({
            to: leerlingEmail,
            leerlingFullName: leerlingName,
            schoolNames: emailableNames,
          });
        }
      } catch (err) {
        console.error('inquiry-submit: leerling-bevestiging failed', err);
      }

      for (const recipient of recipients) {
        const school = schoolById.get(recipient.rijschool_id);
        if (!school?.email) {
          console.warn('inquiry-submit: rijschool zonder e-mailadres, outreach overgeslagen', recipient.rijschool_id);
          continue;
        }
        try {
          const sent = await sendRijschoolOutreachMail({
            to: school.email,
            rijschoolName: school.name,
            leerlingFullName: leerlingName,
            rijbewijsCategorie: categorie,
            schakeling: typeof schakeling === 'string' ? schakeling : null,
            gewensteStartdatum: startdatum,
            bericht,
            chatToken: recipient.rijschool_chat_token,
            recipientId: recipient.id,
          });
          if (sent) {
            await supabase
              .from('inquiry_recipients')
              .update({
                status: 'app_notified',
                notification_email_sent_at: new Date().toISOString(),
                notified_email: school.email,
              })
              .eq('id', recipient.id);
          }
        } catch (err) {
          console.error('inquiry-submit: outreach failed', recipient.id, err);
        }
      }
    });

    return NextResponse.json(
      { inquiry_id: inquiryId, recipients_count: recipients.length },
      { status: 201, headers },
    );
  } catch (error) {
    console.error('inquiry-submit error:', error);
    return NextResponse.json(
      { error: 'Er ging iets mis. Probeer het opnieuw.' },
      { status: 500, headers },
    );
  }
}
