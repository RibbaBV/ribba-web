# Supportvormgeving — 18 oktober 2026

Branch: `feat/support-unified-design`, basis `ed54008` (ribba-web).

## Onderzoek en scope

- `/support`: laden, login, geen toegang, factorselectie, tweefactor instellen/invoeren en scholenoverzicht. Behoud van MFA/eligibility, zoeken, filter, testscholen, uitloggen en tellingen.
- `/support/[id]`: dossier, onboarding, proef/licentie/Stripe, schoolgegevens, koppelingen, gebeurtenissen en herstelde fouten; bewerklinks en sectienavigatie behouden.
- `/support/[id]/bewerken`: profiel- en factuurvelden, validatie, conflict/opslaan, opnieuw laden en waarschuwing bij niet-opgeslagen wijzigingen behouden.
- `/support/dashboard/journey`: schoolselectie, kwaliteit, appmetingen, supportregistratie en opvolging behouden.
- `/support/dashboard`: bestaande donkere view blijft behouden; gedeelde documentkleuren sluiten daarop aan.

Gedeelde kleuren zijn uitsluitend geladen in de afzonderlijke `(support)` root-layout. Marketing/site-layout blijft buiten scope. Eigenaarlink in het dossier gebruikt dezelfde bestaande servercontrole als het overzicht. Geen wijziging aan API's, database, rechten, sessies, formulierhandlers of appcode. Dashboard en klantreis blijven ownerOnly + verse MFA; geen accountrechten toegevoegd.

## Verificatie

- 500 bestaande tests geslaagd, inclusief supportautorisatie, sessie-isolatie, eigenaarfuncties, profielvalidatie en registratiecontracten.
- Productiebuild en `scripts/check-support-isolation.mjs` geslaagd.
- Lokale echte viewcomponenten met herkenbaar fictieve data bekeken: overzicht, dossier, klantreis. Filteren, zoeken en lege toestand gecontroleerd.
- Formuliervormgeving gecontroleerd met lokale velden; werkelijk opslaan van klantgegevens niet uitgevoerd voor een visuele wijziging.
- Mobiel 390px: dossier en klantreis zonder horizontale pagina-overflow, formulier in één kolom.
- Werkelijk lokaal inlogscherm bekeken zonder inlog-/MFA-mutaties. Tweefactorlogica ongewijzigd; QR krijgt expliciet een witte ondergrond.
- Tijdelijke previewroute verwijderd. Geen fictieve data of previewroute in de wijziging.

Implementatie gereed voor PR-review. Nog niet gemerged of live geverifieerd. Productie-acceptatie volgt na expliciete uitrol.
