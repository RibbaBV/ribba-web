# Schoolgegevens bewerken vanuit support

Status: lokaal gebouwd; nog niet uitgerold of met productiegegevens geaccepteerd.

De eigenaar opent een schooldossier en kiest **Schoolgegevens bewerken**.
Het formulier bewerkt bedrijfsnaam, contactgegevens, adres, KvK, btw en IBAN.
Voor een BV zijn ook statutaire naam en afwijkend vestigingsadres beschikbaar.
Land en rechtsvorm veranderen niet via deze route. Pakketten volgen afzonderlijk.

## Opslag en toegang

De bestaande supportcontrole verifieert de gebruiker, actieve staffstatus en
een recente tweede factor. Beide endpoints gebruiken `no-store`. De API
accepteert alleen de expliciete veldenlijst en gebruikt de geverifieerde actor.
Clientvalidatie en servervalidatie delen dezelfde regels. IBAN-controle bewijst
formaat en controlegetal, niet eigendom of bestaan van de rekening.

De database vergelijkt de geladen versie onder een rij-lock met de actuele
schoolgegevens. Een conflict geeft 409; de gebruiker moet opnieuw laden.
De wijziging en `school.profile.updated` worden in één transactie opgeslagen.
Het log bevat actor, school en gewijzigde veldnamen, geen gekopieerde veldwaarden.
Een mislukte audit-insert draait de schoolwijziging terug.

Het contactadres is geen loginadres. De IBAN-wijziging past de Ribba-schoolbron
aan, niet Stripe/Mollie, externe boekhoudprofielen of reeds uitgegeven facturen.
Een netwerkfout na verzenden kan betekenen dat opslaan wel gelukt is; het
scherm vraagt dan eerst opnieuw te laden.

## Uitrol en acceptatie

1. Eerst ribbaPro-migratie `20261006182457_support_schoolgegevens.sql`
   reviewen, mergen en via het repo-runbook toepassen; elke productiestap na GO.
2. Controleer RPC-definities en EXECUTE-rechten: uitsluitend service_role.
3. Daarna deze webwijziging uitrollen.
4. Met afgesproken testschool: dossier openen, veld aanpassen, opslaan,
   herladen en controle in app/database plus logboek. Daarna herstellen.
5. Twee open formulieren: tweede verouderde opslag moet conflict geven.

Lokaal bewijs: Node-tests voor validatie/API, bestaande supportauth-tests en
de PostgreSQL-testgroep **Support schoolgegevens** in ribbaPro. Productie-
acceptatie en visuele browseracceptatie zijn afzonderlijk nog nodig.

Rollback: webwijziging terugdraaien verwijdert de nieuwe bedieningsroute.
De aanvullende RPC's kunnen blijven bestaan met uitsluitend service-rechten;
zo nodig EXECUTE intrekken via een nieuwe migratie. Reeds opgeslagen
schoolgegevens worden nooit automatisch teruggedraaid.
