# Schooldossier en groeimetingen

## Nu beschikbaar en gebruikt

Het dossier gebruikt `support_school_detail` en `support_school_events`: huidige aantallen leerlingen, lesrecords, pakketten en facturen; instelmijlpalen met tijdstippen; abonnement/licentie; koppelingen; operationele gebeurtenissen. Deze bronnen worden niet met een nieuw logboek gedupliceerd. Dossierbezoeken worden al vastgelegd met school-ID, medewerker en actie via `withSupportAccess`.

Huidige recordaantallen zijn geen periodegroei, omzet of menselijk gebruik. Verwijderingen kunnen aantallen veranderen. Een lesrecord is geen gegeven les; een factuur is geen betaalde omzet. De vier nieuwe dossierkaarten vermelden daarom expliciet 'Huidige stand · geen periodemeting'.

De bestaande eigenaar-klantreis bewaart databasehandelingen en hulpvragen. De bestaande wizard/pakketmetingen zijn afhankelijk van de uitgerolde appversie. Geen waarneming is geen bewijs van stilstand. Deze wijziging past geen bewaartermijnen, rechten of databasefuncties aan.

## Meetcontract voor aanvullingen

| Beslissing | Per school bijhouden | Betrouwbare bron | Voorwaarde |
| --- | --- | --- | --- |
| Onboarding verbeteren | Tijd tussen aanmelding en eerste waardevolle handeling, stap gestart/afgerond/geblokkeerd | Bestaande mijlpalen plus versiegebonden app-events | Klant, support, import en automatisering onderscheiden; ontbrekende historie tonen |
| Retentie begrijpen | Actieve weken, terugkeer, gebruik van planning/pakketten/facturatie | Expliciete menselijke sessie/feature-events | Geen schermtekst, leerlinginhoud of ruwe foutmeldingen; bots/achtergrondtaken uitsluiten |
| Proef naar betaald verbeteren | Proefstart/einde, eerste succesvolle abonnementsbetaling, upgrades, downgrades, opzegdatum/redencategorie | Stripe webhook met idempotent event-ID + Ribba-licentie | Gratis/testscholen uitsluiten; betaalstatus en toegang apart |
| Ondersteuning verminderen | Onderwerp, blokkade, hulpvorm, totale tijd, heropening, oplossingsdatum | Interne hulpvraagregistratie | Geen WhatsApp-inhoud; tijdsdefinitie vastleggen; schrijven blijft gelogd |
| Betrouwbaarheid verbeteren | Geanonimiseerde foutcode, feature, appversie, platform, herstelmoment | Backend + begrensde apptelemetrie | Geen tokens, IBAN, contactgegevens of formulierwaarden in events |
| Acquisitie beoordelen | Aanmeldkanaal, campagne, verwijzing, bekende acquisitiekosten | Aanmeldflow en expliciete bronregistratie | Onbekend is een geldige categorie; geen historische bron gokken |

## Structurele uitvoering

1. Controleer bestaande app-, web- en databasemeetcontracten vóór extra events. Maak per metric definitie, tijdzone, deduplicatiesleutel en bron vast.
2. Sla alleen ontbrekende events op. Minimale velden: event-ID, school-ID, eventnaam/versie, occurred_at, received_at, bron, actorcategorie, platform/appversie en toegestane categorische metadata.
3. Laat de server school/actor afleiden uit de sessie; vertrouw geen ingestuurde school-ID. Begrens eventvolume en dubbele events. Geen nieuwe leesrechten voor klanten of medewerkers.
4. Maak dagelijkse schoolaggregaten en cohorten; ontwerp bewaartermijn en verwijderen bij schoolverwijdering vóór migratie. Hergebruik de bestaande meetinfrastructuur en onderhoudstaken waar mogelijk.
5. Laat AI uitsluitend toegestane aggregaten, meetdekking en een tijdsvenster ontvangen. Elk voorstel vermeldt bewijs, onzekerheid, actie en succescriterium. Geen automatische klantbenadering of accountwijzigingen.
6. Valideer met testscholen: dubbele/late events, verlopen sessie, andere school-ID, verwijderde school, ontbrekende appversie en importverkeer. Rol database en app/web in compatibele volgorde uit.

Dit document is een uitvoerplan, geen claim dat bovenstaande aanvullende events al zijn uitgerold. Deze PR verbetert de navigatie en presenteert bestaande echte gegevens; aanvullende opslag vraagt een aparte, geteste wijziging in de app/database-repository.
