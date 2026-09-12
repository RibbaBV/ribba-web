# Ribba Ambassadeursprogramma

Een leerling tipt zijn rijinstructeur over Ribba en verdient EUR 25 zodra die
rijschool zijn eerste betaling voor een betaald plan doet. Dit is het tweede
referral-programma van Ribba; het eerste (`REFERRAL-PROGRAMMA.md`) loopt per
rijschool en precies andersom.

| | referral-programma | ambassadeursprogramma |
|---|---|---|
| wie brengt aan | een partner van de rijschool | een leerling |
| wat wordt aangebracht | een leerling | een rijschool |
| wie betaalt | de rijschool, via SEPA-incasso | Ribba, vanaf het platformsaldo |
| verdienmoment | proefles of eerste betaalde les | eerste betaling voor een betaald plan |
| bevestiging | de rijschool bevestigt elke uitbetaling | geen; de ambassadeur int zelf |

Wat ze delen is `referral_partners`: de uitbetaalidentiteit van een persoon,
met zijn Stripe Express-account. Wie al partner is van zijn rijschool en ook
ambassadeur wordt, doorloopt de verificatie één keer.

## Repo-verdeling

| Onderdeel | Repo |
|---|---|
| Schema, attributietrigger, verdienmoment in de stripe-webhook | **ribbaPro** |
| Ambassadeursportal, tip-cookie, innen, transfers, mails | **ribba-web** (deze repo) |
| Advertentiepagina, tip doorgeven vanaf ribba.nl, voorwaarden | **ribba.app** |

## De keten, van klik tot geld

1. **Aanmelden.** `link.ribba.app/ambassadeur/meedoen`. E-mail-OTP, akkoord met
   de voorwaarden, en `POST /api/ambassadeur/enroll` maakt de deelname met een
   unieke code van 8 tekens (alfabet zonder 0/O/1/I).
2. **Delen.** De ambassadeur krijgt `https://ribba.nl/voor-rijscholen?tip=CODE`.
   Dat is bewust ribba.nl en niet mijn.ribba.app: de advertentie zegt "stuur je
   instructeur naar Ribba.nl", en een instructeur die op een inschrijfformulier
   landt in plaats van op een verkooppagina, schrijft zich niet in.
3. **Attributie.** ribba.nl bewaart de code en plakt hem op elke doorklik naar
   mijn.ribba.app. Daar vangt `<TipCapture />` hem op en zet de cookie
   `ribba_tip`, 30 dagen, last-touch. Cookies zijn niet deelbaar tussen
   ribba.nl en ribba.app, dus de querystring is de enige brug tussen die twee.
4. **Inschrijven.** Het registratieformulier stuurt `ribba_tip_code` mee naar
   `/api/signup/start`, dat alleen de vorm controleert en hem op de pending
   registratie zet. Of de code bestaat beslist de database, bij activatie.
5. **Verdienen.** De stripe-webhook in ribbaPro roept bij een `invoice.paid`
   met `amount_paid > 0` de RPC `ribba_referral_markeer_verdiend` aan. Een
   proefperiodefactuur van EUR 0 telt niet mee.
6. **Innen.** De ambassadeur krijgt een mail, klikt op innen, rondt eenmalig
   zijn Stripe-verificatie af, en de dagelijkse cron maakt de transfer.

## Waarom innen een aparte stap is

Het zou kunnen: geld automatisch overmaken zodra het verdiend is. Maar dan moet
iedereen die ooit een link deelde vooraf door een KYC-flow, ook wie nooit iets
verdient. Nu vragen we de gegevens pas wanneer er echt iets klaarstaat, en de
klik op "innen" is meteen het moment waarop iemand bevestigt dat het bedrag
klopt.

## De cron: `/api/cron/ribba-ambassadeur-payouts` (dagelijks 07:00)

1. **Verdiend-mails.** `verdiend_mail_op` is de marker. Alleen markeren bij een
   geslaagde verzending: dit is het enige bericht dat iemand vertelt dat er geld
   klaarstaat, dus een mislukte mail moet morgen terugkomen.
2. **Transfers.** Geclaimde payouts gaan vanaf het platformsaldo naar het
   Express-account. De transfer komt vóór de statusupdate, met een
   idempotency-key per payout: een tweede aanroep levert dezelfde transfer op,
   dus deze volgorde kan hooguit een payout nog eens laten langskomen. Andersom
   zou een crash na de statusupdate iemand zijn geld kosten.
3. **Naveging.** De webhook mag nooit een betaling laten mislukken over een
   referral, dus als de RPC daar stukgaat blijft het bij een incident. Deze stap
   trekt tips die langer dan een uur op `aangemeld` staan na bij Stripe, en
   markeert ze alsnog.

## Geen nieuwe env-variabelen

`STRIPE_SECRET_KEY` (de restricted key met Transfers-recht), `CRON_SECRET`,
`RESEND_API_KEY` en de Supabase-vars staan er al voor het referral-programma.

## Bekende risico's (geaccepteerd)

- **Zelf tippen.** De attributie weigert een tip waarbij het e-mailadres van de
  ambassadeur gelijk is aan dat van de inschrijving. Een rijschoolhouder die een
  tweede adres gebruikt kost ons EUR 25. Bij dit bedrag is dat te overzien, en
  het is zichtbaar in de data.
- **De brug tussen ribba.nl en mijn.ribba.app.** Breekt het doorgeven van de
  parameter op ribba.nl, dan verdwijnt een tip zonder foutmelding. Daarom staat
  de vorm van de code op één plek (`lib/ribba-tip.ts`) en is die getest.
- **Inkomsten van ambassadeurs** kunnen aangifteplichtig zijn. Dat staat in de
  voorwaarden; de afdracht is aan de ambassadeur.
- **Terugdraaien na een chargeback.** Betaalt een rijschool zijn eerste factuur
  en wordt die later teruggeboekt, dan is de beloning al onderweg. Dat is
  platformverlies tot een handmatige correctie.
