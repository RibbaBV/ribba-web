# PIRAAT-conversies — meetcontract en bewijs (12 november 2026)

Doel: `/support/gebruik` wordt een beslisscherm voor conversieverbetering met dagelijkse lijnen, in plaats van losse scherm- en kliktotalen. Uitwerking van AARRR (acquisitie, activatie, retentie, referral, revenue) met bereik en engagement erbij. Er worden geen generieke branchebenchmarks of fictieve historische percentages ingevoerd.

## Keten en afbakening

Niveau B voor de webuitbreiding; gevoelige platformaggregaten blijven achter bestaande eigenaartoegang, verse MFA en verplichte audit. Keten: bestaande bronrecords → begrensde serverlezer → cohortberekening → eigenaar-API → dagelijkse lijnen → groeibeslissing. Geen nieuwe databasegrants, tabellen, event-ingest, betalingen, abonnementwijzigingen of klantacties. Geen productie-write, migratie, merge of deploy uitgevoerd.

De bestaande, geaggregeerde appgebruikroute blijft beschikbaar voor supportmedewerkers. De nieuwe `/api/support/gebruik/conversies` is `ownerOnly`, niveau 0: alleen aggregaten, zonder leerling-, school-, factuur-, sessie- of event-ID's. Een mislukte bron of een harde leesgrens wordt niet als een volledige nulpopulatie getoond. Raw SQL-/providerfouten komen niet in de response.

## Echte broninspectie

Read-only op 12 november, buiten de API via de bestaande servercredentials; geen namen, contactvelden, formulierinhoud of betaalpayloads opgevraagd. Ruwe pseudonieme analysebestanden blijven uitsluitend lokaal en worden niet gecommit.

- `support_app_gebruik(30, null, false)`: 2.990 geldige events van 23 unieke gebruikers. Eerste beschikbare gebeurtenis 10 november 2026, 21:13 UTC. Geen 30 dagen complete telemetry; slechts delen van drie kalenderdagen.
- Rollen overlappen: 18 leerlingen, 5 eigenaren en 3 gebruikers met een onbekende rol; deze aantallen mogen niet tot 26 unieke personen worden opgeteld.
- Leerlingen: 13 unieke personen openen Theorie, 5 een hoofdstuk. Als dagcohort: 11 november 2/5 (40%) naar hoofdstuk; 12 november 3/9 (33,3%, voorlopig). Geen claim dat het onderwerp is afgerond.
- Leerlingengagement-proxy: 11 november 4/7 (57,1%); 12 november 11/13 (84,6%, voorlopig). Waardevolle schermen zijn géén onafhankelijke businessresultaten.
- D1 voor het cohort van 11 november: voorlopig 3/7 terug op 12 november; de dag is nog niet gesloten. D7 heeft nog geen volwassen meetcohort. Er is geen vergelijkbare vorige meetperiode voor een bewezen lift.
- Plannen: 6 klikkers bereikten op 12 november het planscherm. Geen bewijs van een verstuurde lesaanvraag.
- Rijschool zoeken → aanvraagformulier: 1/1 op 11 november en voorlopig 1/1 op 12 november. Niet presenteren als twee verstuurde leads of 100% duurzaam succes.
- Geen waargenomen oefenexamenstart/resultaatschermen in deze snapshot; geen noemer betekent onbekend, niet 0% afronding.
- 149 publieke gebruikersrecords, 118 leerlingprofielen, 13 schoolrecords waarvan 7 niet intern. Dit is geen installatie- of websitebezoekpopulatie.
- `billing_webhook_receipts`: 10 externe, geslaagde Stripe `invoice.paid`-receipts in de aanwezige historie. Ze bevatten geen factuurbedrag. Een mogelijke €0-factuur is daarom geen bewezen omzet; er wordt geen MRR, euro-omzet of eerste-betaalconversie uit afgeleid.
- 0 Ribba-ambassadeursaanmeldingen in `ribba_referrals`; geen referralpercentage zonder starters.
- De leesvoortgang bevat 38 actuele records, 9 met `completed=true`, verdeeld over 17 gebruikers. `updated_at`/`visited_at` bewaren niet het eerste afrondmoment. Deze mutable stand wordt **niet** achteraf tot dagelijkse afrondingsgeschiedenis omgebouwd.

Deze tellingen zijn een onderzoeksnapshot, geen hardcoded dashboardwaarden. Productie leest de actuele bronnen opnieuw.

## Doelen per fase

| Fase | Gewenst conversiedoel | Nu betrouwbaar beschikbaar | Nog nodig voor de echte doelconversie |
| --- | --- | --- | --- |
| Bereik | Unieke bezoeker → storeklik → installatie | Geen gekoppelde web-/storepopulatie in deze databron | Dagelijkse bezoekers en storekliks met dezelfde meetdefinitie; installatie-attributie, consentdekking en cross-device onzekerheid |
| Acquisitie | Bezoek/start registratie → bevestigd leerlingaccount; rijschoolproefstart | Nieuwe publieke leerlingaccount-/schoolrecords op `created_at` | Anonieme registratie-starts, bevestigde account-events, uitnodiging/eigen aanmelding; verwijderde/backfilled records apart behandelen |
| Activatie leerling | Eerste onderwerp succesvol afgerond binnen 24 uur na bevestigde registratie | Theorie → hoofdstuk openen, als **gedragsproxy** | Append-only eerste succesvolle afronding; niet een klik of actuele progress-row |
| Activatie rijschool | Eerste zelf aangemaakte les opgeslagen binnen 7 dagen | Agenda → aanmaakscherm, als **gedragsproxy** | Bevestigde opslag met bron klant/support/import/automatisering en exact cohort |
| Engagement | Terugkerend leren/oefenen/rijles regelen; leerfrequentie en herhaalde oefening | Waardevolle schermen / actieve gebruikers per dag, als **proxy** | Voltooide onderwerp-/examen-/aanvraag-events en onafhankelijke run-/poging-ID's |
| Retentie | D1 en D7 terugkeer; later signupcohorten en W4 | Dag D actief → ook op D+1/D+7 actief | Meer complete meetdagen; dit is activity-retentie voor bestaande én nieuwe gebruikers, geen signupretentie |
| Referral | Deelklik → geldige aanmelding → verdiende beloning | Aanmeldingen met `aangemeld_op` en `verdiend_op`, venster 30 dagen | Gekoppelde deel-events en dezelfde ambassadeursnoemer; fraude/void en uitbetaling apart |
| Omzet | Proefstart → eerste werkelijke betaling; MRR, churn, netto ontvangen | Verwerkte `invoice.paid`-receipts als **diagnostische proxy** | Stripefactuurbedragen/valuta, €0 uitsluiten, subscriptions/dezelfde schoolcohorten, refunds/creditnota's en bekende meetdekking |

Referral en omzet zijn platformbrede rijschoolmetriek, ook bij selectie Leerlingen. Ze worden niet aan de geselecteerde leerlinggebruikers toegeschreven. De zes kaarten zijn verschillende fasen met eigen eenheden/noemers, geen monotone funnel die je met elkaar kunt vermenigvuldigen.

## Tijd, noemers en aggregatie

- Kalenderdagen in `Europe/Amsterdam`; DST wordt met echte lokale datums afgehandeld. Geen vast CET-offset in code.
- App-events gebruiken serverontvangsttijd. Bij gelijke batchtijd bepaalt het server-ID de ontvangstvolgorde. Dit bewijst niet de exacte lokale handelingstijd; vertraagd transport kan een daggrens verschuiven.
- Startdag-funnels vereisen dezelfde gebruiker, een later ontvangen doel en dezelfde kalenderdag. Per gebruiker/dag één starter en één conversie. Geen doorsnede van los getelde periodeschermen.
- De eerste beschikbare app-meetdag telt als onvolledig; daarvoor geen nullen invullen. Vandaag en nog niet gesloten retentiedagen zijn voorlopig. D7 van een recent cohort blijft onbekend.
- Periodeconversie = som van complete dagtellers / som van complete dagnoemers. Dit zijn dagcohortstarts (dezelfde gebruiker kan op verschillende dagen starten), niet unieke personen over de hele periode.
- 7-daags gemiddelde = gewogen somteller/somnoemer van zeven complete dagen, nooit gemiddelde van dagpercentages. Geen volledige zeven dagen: geen lijn.
- Vergelijking toont procentpunten, niet een relatieve procentuele lift. Alleen overeenkomstige vensterposities met aan beide kanten volledig gedekte, gesloten dagen. De tegenhanger van vandaag en onvolwassen cohorten vallen aan beide kanten weg. De vergelijking vermeldt beide percentages en het aantal gedeelde dagen, los van het totaal voor de huidige periode. Zonder gedeelde dekking of een bruikbare noemer volgt geen vergelijkingscijfer.
- Nul starters geeft geen percentage. Echte 0 conversies bij N>0 geeft wel 0%. Kleine aantallen blijven met N zichtbaar, zonder bewezen experiment-/causaliteitsclaim.
- Accounts en scholen zijn de momenteel aanwezige records, geen onveranderlijk archief; verwijderingen en imports kunnen historische aantallen wijzigen. Er wordt geen anoniem bezoek-naar-accountpercentage uit gemaakt.
- Test/pilotscholen en `ota_id=dev` standaard uitgesloten. Interne-only leerlingkoppelingen worden ook voor accountrecords uitgesloten. Ongekoppelde testaccounts zijn niet met een naamheuristiek te herkennen en kunnen aanwezig blijven.
- Source cutoff is de leestijd; zes brontabellen worden niet onder één database-transactie gelezen. Dit is een geaggregeerde observatie met een tijdgrens, geen atomair financieel snapshot.

## Groeiwerk op basis van de echte data

1. Onderzoek Theorie → hoofdstuk: het volwassen dagcohort is 2/5, te klein voor een betrouwbare lift maar concreet genoeg voor een bruikbaarheidstest. Niet alleen meer verkeer inkopen.
2. Toon de eerste succesvolle leerafronding en daarna een passende oefenstart; instrumenteer afronding voordat dit als activation wordt geclaimd.
3. Onderzoek de route naar oefenexamens: er zijn nog geen start-/resultaatschermen waargenomen. Dat bewijst geen technisch defect of dat niemand examens maakt; controleer appversie, zichtbaarheid en eventdekking.
4. Koppel les-/aanvraagresultaten, zodat 6/6 planschermbereik niet ten onrechte als boekingsconversie eindigt.
5. Wacht voor D7 en vergelijkbare trendvensters op de benodigde historie; de lijn krijgt geen historische backfill.
6. Sluit web- en Stripebroncontracten aan om bereik/acquisitie/omzet te voltooien. Dit is expliciet meetwerk; de huidige update verzint die noemers niet.

## Verificatie en uitrol

- Gerichte tests voor ontvangstvolgorde/batches, rol-dedup, interne scholen, Amsterdam/DST, nul versus onbekend, volwassen cohorten, gewogen percentages, D1/D7, referralvensters, €0-omzetambiguïteit, privacy en onvolledige paginatie.
- De bestaande support-/MFA-/eigenaarpoort blijft leidend. De oude appgebruikroute blijft op hetzelfde toegangsniveau; de nieuwe eigenaarroute kan geen identiteiten retourneren.
- Browsercontrole gebruikt de echte export van de nieuwe **aggregaatberekening** op de read-only productiedata, in een lokale harness buiten de repo. Geen authenticatiebypass of previewroute in productiecode. Dit is geen ingelogde productie-E2E-test.
- Geen DB-migratie nodig voor de beschikbare metingen. Nog ontbrekende resultaat-/web-/betaalbroninstrumentatie moet repo-first worden ontworpen en getest, zonder bestaande businessflows afhankelijk te maken van analytics.
- Na expliciete merge/deploy: eigenaar met verse MFA controleert de echte route, een gewone supportmedewerker behoudt de ruwe appgebruikcijfers en krijgt geen eigenaaraggregaten; test tokenverloop, doelgroep/periode en dagnoemers. Een PR of lokaal testbewijs betekent niet dat het al live staat.

### Uitgevoerde lokale controles

- `npm test`: 661 tests geslaagd, inclusief bronpaginatie, cohortberekening en de echte toegangs-wrapper met gesimuleerde sessies/MFA/auditfouten.
- `npm run build`: geslaagd. `npm run lint`: geen fouten; drie bestaande waarschuwingen buiten deze wijziging.
- `node scripts/check-support-isolation.mjs`: geslaagd, nu ook expliciet voor `/support/gebruik`.
- Browsercontrole op 1440, 1024, 768, 390 en 320 pixels: geen horizontale pagina-overflow of JavaScript-fouten; doelgroep/periode, dagkiezer, meetdoelen, lege data en gewogen-gemiddeldebediening gecontroleerd met echte geaggregeerde brondata.

### Reviewcorrecties

Alle vier inline bevindingen bevestigd en minimaal hersteld: onbekende eventkwaliteit is `null` (lege gereedstaande bronnen blijven 0), periodevergelijking gebruikt gekoppelde gesloten dagposities, groeiprioriteit volgt neutraal de geselecteerde proxy met bestaande bewijs-/noemerfilters, en niet-uitgerijpte cohorten behouden dagkiezer, bekende noemers en statussen zonder percentage. Regressies op volledige en gedeeltelijke vensterdekking en bronuitval toegevoegd.

Hercontrole: 664 tests geslaagd, TypeScript en productiebuild geslaagd, lint zonder fouten (dezelfde drie bestaande waarschuwingen), support-isolatie geslaagd. CodeRabbit CLI is lokaal niet geïnstalleerd.
