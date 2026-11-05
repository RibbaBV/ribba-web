# Leerlingoverzicht voor de eigenaar

Status: lokaal gebouwd; nog niet gemerged, gemigreerd, uitgerold of live geaccepteerd.
Branch `feat/owner-learners-overview`, afzonderlijk in ribba-web en ribbaPro.

## Onderzoek en contract

Niveau C: leerlingidentiteiten, eigenaarrechten, audit en geaggregeerde mail/AI.
Keten: bestaande appregistratie → auth.users → learner_profiles / students →
server-only RPC → MFA/eigenaar/audit → supportoverzicht. Geen appwijziging nodig.
De actuele appbron op `origin/main` gebruikt register-learner: accountaanmaak,
activatiemail, wachtwoord op web, login, zelfstandig profiel. Oude OTP-clients
blijven werken. De nieuwe functie verandert geen van deze schrijfpaden.

Bronnen in ribbaPro: register-learner/service.ts, leerlingProfielPoort.ts,
leerlingToestand.ts, learner_profiles-migraties, owner_dashboard-migratie en
verwijder_eigen_leerlingaccount. Metadata email_confirmed_at is geen
activatiebewijs: register-learner zet email_confirm al bij accountaanmaak.

Definitie v1:
- Eén bestaande auth-identiteit met learner_profile, students.user_id of de
  standalone_learner-markering. Schoolkaarten zonder auth-account tellen niet.
- Niet verwijderd, niet anoniem, geen toekomstige aanmaakdatum.
- Platform_staff, expliciet gemarkeerde testaccounts en accounts met uitsluitend
  interne schoolrelaties uitgesloten. Gemengde interne/echte schoolrelaties
  tellen mee, tenzij het account expliciet als test gemarkeerd is.
- Onder bevestigde `onderates86` als eigen testidentiteit. De migratie markeert
  bestaande Gmail/Hotmail-basisadressen en +aliassen met exact die lokale basis
  eenmalig op vast UUID. Geen brede naamheuristiek of publiek wijzigbaar testvlagje.
- Andere losse testaccounts zijn nog niet volledig geïnventariseerd. Onder bekijkt
  later de lijst en geeft ze door. Tot die tijd heten cijfers niet “testvrij”.
- Status per identiteit: actief > wachtlijst > geslaagd > gestopt > geen schoolrij.
  Alle schoolrelaties blijven zichtbaar. Geen schoolrij is geen bewijs dat iemand
  nooit een school had: bronrecords kunnen verwijderd zijn.
- Naam komt uit learner_profiles; alleen bij ontbrekende profielnaam en één unieke naam over de exact gekoppelde schoolkaarten wordt die schoolnaam gebruikt (met bronlabel). Tegenstrijdige schoolnamen worden niet gegokt.
- Profiel volledig = dezelfde acht niet-lege velden als leerlingProfielPoort.
  Schoolgebonden leerlingen hoeven hun zelfstandige profiel niet af te maken.
- Laatste login uit auth; geen eerste-logintijd, geen DAU, downloads of bewezen
  activatie/conversie. Een activatielink kan ook een sessie starten.
- Metadata is een aanwijzing, nooit autorisatie of betrouwbare herkomstmeting.
- Nieuwe accounts over 7/30 dagen zijn rollende vensters. Grafiek heeft 30
  Amsterdamkalenderdagen. Verwijderde accounts verdwijnen ook uit de historie.

Live read-only nulmeting op 4 november vóór expliciete onderates86-uitsluiting:
103 accounts, 42 zonder actieve school, 15 zonder schoolrij, 13 zonder login.
Dit zijn onderzoekscijfers, geen gevalideerde klant/KPI-cijfers: losse tests zaten
hier nog tussen. Er is geen productiedata gewijzigd.

## Toegang en privacy

`GET /api/support/dashboard/learners`: niveau 0, alleen totalen.
`POST` op dezelfde route: niveau 2, minimaal 10 tekens inzagereden, maximaal 25
rijen per pagina. Filter en paginanummer in audit; zoekterm/email niet in URL/log.
De reden mag geen leerlinggegevens bevatten. Alleen naam/email, aanmaak/laatste
login, profielstatus en schoolrelaties; geen geboortedatum/adres/telefoon in API.

Beide routes gebruiken withSupportAccess: server-gecontroleerde identiteit,
verse MFA, actieve supportmedewerker én is_platform_owner. Geen audit = geen data.
RPC's controleren owner opnieuw; alleen service_role mag ze uitvoeren. Private
row-helper en testmarkeringen zijn niet rechtstreeks voor service_role leesbaar.
Browserdata hangt aan de actuele sessie en verdwijnt bij sessieverlies.
Geen nieuwe rollen, ownerbinding, cache of marketingtracking toegevoegd.

AI krijgt alleen de expliciete geaggregeerde allowlist in learnerEvidence,
met eigen meettijd en definitie. Alleen new_30 heeft een rollend 30-dagenvenster;
de overige leerlingtellingen beschrijven de volledige huidige accountbasis. De onderbouwing wordt bij het
voorstel opgeslagen en getoond. Zonder meetbare aandachtspunten wordt evidence
learners geweigerd. Een ontbrekende nieuwe RPC blokkeert bestaande school-AI niet.

## Dagmail (standaard uit)

Vercel-route `/api/cron/owner-learners`, 08:00 UTC dagelijks. Vereist CRON_SECRET,
VERCEL_ENV=production, OWNER_LEARNER_DIGEST_ENABLED=true en RESEND_API_KEY.
Ontvanger komt uitsluitend uit de actieve platform_owner/auth-identiteit; geen
adres uit request of vrije configuratie. De mail bevat totalen, geen leerling-PII.
Voorlopig geen mail naar leerlingen, marketinglijst of externe CRM.

Databaseclaim is atomair, één per vorige Amsterdamdag, lease 10 minuten. Payload
blijft gelijk bij retry. Resend idempotency-key per dag, retry alleen binnen 23 uur
na claim (provider bewaart sleutel 24 uur). Niet afgerond geeft 503, geen fictieve
succesmelding. Dagelijks schema doet geen automatische retry binnen dezelfde dag;
na fout kan dezelfde cron veilig opnieuw worden aangeroepen binnen die dag/23 uur.
Gemiste eerdere dagen worden niet stil ingehaald. Ontvangerwissel/revocation blokkeert
hergebruik van een bestaande claim. Na provideracceptatie heet de status “sent”,
niet “afgeleverd/geopend”. Mailbounces worden niet gemeten.

Bron providercontract: https://resend.com/docs/dashboard/emails/idempotency-keys
Mailclaims/payload maximaal 90 dagen na volgende actieve cron. Geen leerlingnamen,
adressen of account-IDs daarin. Uitsluitings-IDs verdwijnen bij accountverwijdering.

## Uitrol en terugweg

1. Review/tests beide repositories; DB-migratie alleen uit ribbaPro.
2. Na apart GO: merge en exacte repo-first migratie
   `20261104163000_owner_learners.sql` via bestaande applyprocedure.
3. Web uitrollen; ownerbinding blijft ongewijzigd. Bevestig eigenaar vs andere
   medewerker/leerling/anon, MFA, audituitval, paginering, lege/foutstaat.
4. Vergelijk totalen met read-only selectie en controleer bekende testuitsluitingen.
   Onder levert overige testaccounts aan; voeg vaste IDs alleen na gerichte preview toe.
5. Afzonderlijke mailactivering + één gecontroleerde verzending/retry en controle
   provider/dashboard. Geen activering uitgevoerd tijdens lokale ontwikkeling.

Terugweg: mailvlag uit, web terug naar vorige versie; additive databasefuncties
kunnen ongebruikt blijven. Geen klantdata gewijzigd door deze migratie en geen
trigger op registratie/login. App-release of OTA niet nodig.

Lokale verificatie: databasefixture PostgreSQL 17 met echte anon/authenticated/
service_role-rollen; eigenaar/staff/revoked, privacy, deduplicatie, testuitsluiting,
metadata-only registratie, pagineringvalidatie, maillease/retry/idempotentie.
Web: 608 tests geslaagd; typecheck en lint zonder fouten (3 bestaande waarschuwingen).
Productieacceptatie en volledige inventaris losse testaccounts blijven open.

Visueel: daadwerkelijke paginaweergave met tijdelijk geïnjecteerde, duidelijk gelabelde fictieve data op desktop en 390px gecontroleerd. Geen horizontale overloop (390/390), definities open/dicht en persoonsgegevens sluiten werkten. Tijdelijke preview verwijderd. Dit bewijst presentatie/bediening, niet de live ingelogde API-keten. Productiebuild en supportisolatiecontrole geslaagd.
