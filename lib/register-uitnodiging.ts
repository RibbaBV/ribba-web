// Wanneer nodigt het publieke inschrijfformulier een leerling meteen uit voor
// de app, en hoe? Pure regels plus één serveraanroep met ingespoten fetch,
// zodat het los te testen is.
//
// AANLEIDING (5 nov 2026, Rijschool 010 Rijbewijs)
// ------------------------------------------------
// Wie zich via het webformulier inschrijft komt op de wachtlijst, en sinds
// 18 okt 2026 zet een databasetrigger "Mag proefles plannen" daarbij meteen
// aan (zolang de school dat niet heeft uitgezet). De uitnodiging voor de app
// hing in de Ribba-app aan het *aanzetten* van die schakelaar — en die stond
// dus al aan. De bevestigingsmail beloofde "een tweede e-mail", die nooit kwam.
//
// DE REGEL
// --------
// Een nieuwe rij op de wachtlijst die direct een proefles mag plannen, zonder
// account en met een bruikbaar e-mailadres, krijgt meteen de wachtwoordmail.
// De school hoeft niets te doen. Staat de proefles-schakelaar uit (de school
// wil nieuwe aanmeldingen eerst zelf zien), dan verandert er niets.
//
// Bewust alleen een NIEUWE rij: bestaat er al een rij zonder account die de
// rijschool zelf aanmaakte, dan heeft de school die bewust zonder uitnodiging
// laten staan. Het formulier vult dan alleen velden aan (SEC003).
//
// WIE DE MAIL MAAKT
// -----------------
// De edge function `invite-student-to-app` in ribbaPro: die maakt het account
// aan, koppelt het aan de leerlingrij en mailt de wachtwoordlink namens de
// rijschool. Sinds 5 nov 2026 accepteert hij een aanroep van onze eigen server
// en nodigt dan uitsluitend het adres uit dat al op de leerlingrij staat.
//
// HOE WIJ ONS LEGITIMEREN
// -----------------------
// Met de kop `x-internal-secret` (== INTERNAL_FUNCTION_SECRET), hetzelfde
// contract als de Plango-routes en de cron-functies. Niet met de
// servicesleutel: in de edge-runtime is SUPABASE_SERVICE_ROLE_KEY niet meer de
// klassieke JWT die wij hebben (gemeten 5 nov 2026), dus een vergelijking
// daarop faalt altijd. De servicesleutel gaat wél mee in Authorization, omdat
// de gateway (verify_jwt) een geldige project-JWT eist. Ontbreekt het geheim
// in onze omgeving, dan roepen we niet aan: dat is een configuratiefout die
// de school in haar melding leest, geen mail die stilletjes niet komt.
// Ontwerp: ribbaPro docs/design/2026-11-05_web-inschrijving-uitnodiging-ontwerp.md.

/** Ribba zet dit nepdomein op leerlingen die zonder e-mail zijn ingevoerd. */
const AUTO_EMAIL_DOMEIN = '@manual.ribba.app';

export function isBruikbaarEmailadres(email: string | null | undefined): boolean {
  const waarde = (email ?? '').trim();
  return waarde.length > 0 && !waarde.toLowerCase().endsWith(AUTO_EMAIL_DOMEIN);
}

export type LeerlingrijNaInschrijving = {
  /** Heeft het formulier deze rij zojuist aangemaakt (niet aangevuld)? */
  nieuw: boolean;
  status: string | null | undefined;
  mag_proefles_plannen: boolean | null | undefined;
  user_id: string | null | undefined;
  email: string | null | undefined;
};

export function moetUitnodigen(rij: LeerlingrijNaInschrijving): boolean {
  return (
    rij.nieuw &&
    rij.status === 'waitlist' &&
    rij.mag_proefles_plannen === true &&
    !rij.user_id &&
    isBruikbaarEmailadres(rij.email)
  );
}

export type UitnodigingsUitkomst =
  | { soort: 'niet' }
  | { soort: 'uitgenodigd' }
  | { soort: 'mislukt'; fout: string };

export const UITNODIGING_BRON = 'web-inschrijving';

/**
 * Roept `invite-student-to-app` aan als onze eigen server. Een mislukking is
 * een uitkomst, geen uitzondering: de inschrijving staat al en blijft staan,
 * net als in de app ("de uitnodiging rolt de schakelaar niet terug").
 * Geen e-mailadres in de foutmelding: die komt in het log en in de mail aan
 * de school, niet in een publiek antwoord.
 */
export const INTERNAL_SECRET_ONTBREEKT = 'INTERNAL_FUNCTION_SECRET ontbreekt in de omgeving van de website';

export async function nodigUitViaServer(opties: {
  supabaseUrl: string;
  serviceKey: string;
  /** INTERNAL_FUNCTION_SECRET; leeg of ontbrekend = niet aanroepen. */
  internalSecret: string | null | undefined;
  studentId: string;
  email: string;
  fetchFn?: typeof fetch;
}): Promise<UitnodigingsUitkomst> {
  const geheim = (opties.internalSecret ?? '').trim();
  if (!geheim) return { soort: 'mislukt', fout: INTERNAL_SECRET_ONTBREEKT };
  const doFetch = opties.fetchFn ?? fetch;
  const url = `${opties.supabaseUrl.replace(/\/$/, '')}/functions/v1/invite-student-to-app`;
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opties.serviceKey}`,
        apikey: opties.serviceKey,
        'x-internal-secret': geheim,
      },
      // mailVariant: één welkomstmail namens de school in plaats van onze
      // bevestiging plus een wachtwoordmail (besluit Önder 6 nov 2026).
      body: JSON.stringify({ studentId: opties.studentId, email: opties.email, bron: UITNODIGING_BRON, mailVariant: 'inschrijving' }),
    });
    if (!res.ok) {
      let fout = `status ${res.status}`;
      try {
        const data = (await res.json()) as { error?: unknown };
        if (typeof data?.error === 'string' && data.error.trim()) fout = `${res.status}: ${data.error.slice(0, 200)}`;
      } catch {
        // geen JSON: de status is genoeg
      }
      return { soort: 'mislukt', fout };
    }
    return { soort: 'uitgenodigd' };
  } catch (e) {
    return { soort: 'mislukt', fout: e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout' };
  }
}

/**
 * Sturen wij zelf nog een bevestiging? Alleen als er géén uitnodiging uitging.
 * Ging hij wel uit, dan heeft de leerling de welkomstmail van de school al
 * (welkom, gegevens, wachtwoord, app, proefles) en is een tweede mail ruis.
 */
export function stuurEigenBevestiging(uitkomst: UitnodigingsUitkomst): boolean {
  return uitkomst.soort !== 'uitgenodigd';
}

/** Het blok "Wat gebeurt er nu?" in onze bevestiging (HTML, zonder gebruikersinvoer). Alleen zonder uitnodiging. */
export function watGebeurtErNuHtml(): string {
  return (
    'Zodra je rijschool je activeert, krijg je een <strong>tweede e-mail</strong> waarmee je een wachtwoord kunt instellen en de Ribba app kunt downloaden. ' +
    'Daarmee zie je je lessen, voortgang en facturen.'
  );
}

/** Eén regel voor de melding aan de rijschool: wat er met de app-toegang is gebeurd. */
export function uitnodigingsRegelSchool(uitkomst: UitnodigingsUitkomst): string {
  switch (uitkomst.soort) {
    case 'uitgenodigd':
      return 'De leerling mag direct een proefles plannen en heeft een uitnodiging voor de Ribba app ontvangen (wachtwoord instellen). Je hoeft hiervoor niets te doen.';
    case 'mislukt':
      return 'De leerling mag direct een proefles plannen, maar de uitnodiging voor de Ribba app kon niet worden verstuurd. Stuur hem zelf via de app: Leerling → Gegevens → Bewerken → Stuur inloglink.';
    case 'niet':
      return 'Bekijk en beheer deze inschrijving in de Ribba app.';
  }
}
