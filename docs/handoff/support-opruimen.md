# Support indelen op taak — 24 november 2026

Opdracht Onder: doorloop de echte supportwebsite, beoordeel dubbele informatie,
voeg overlappende onderdelen samen en verwijder overbodige oude weergaven.
Niveau B, presentatie/navigatie. Geen nieuwe datameting, rechten of databasewijziging.

Safari-audit: acht hoofdingangen. Leerlingen en Gebruikers tonen beide
registraties en zonder-schooltotalen. Het algemene Overzicht gaat feitelijk
alleen over rijscholen. Hulpvragen staan onder diagnostiek. Leerlingkaarten en
loginaccounts worden allebei Leerlingen genoemd; sessieactiviteit lijkt online.

Nieuwe indeling (bestaande routes blijven bereikbaar):
- Gebruikers: aantallen/nieuw/actief/aanwezigheid/versies. Leerlinghulp en
  toestemming als gerichte vervolgpagina: onvolledig profiel, nog niet ingelogd,
  zelfstandig aangemeld, marketingtoestemming en leerlingkaarten.
- Rijscholen: zoeken, ontwikkeling/aandachtspunten, aanmeldingen/abonnementen.
- Hulpvragen: registratie/opvolging eerst; bestaande appdiagnostiek uitklapbaar.
- Groei: conversie en terugkeer; expliciet onderscheiden van accounttellingen.
- Tegoed: bestaande beveiligde zoek- en logboekflow.

Verwijderd: tweede registratiegrafiek, dagcijferlijst, nieuwe-account-KPI,
zonder-actieve-school-KPI op de leerlinghulppagina; drie overlappende
hoofdingangen. De lange versie/OTA-verdeling is op aanvraag zichtbaar.
Geen persoonsinzage toegevoegd: namen blijven achter expliciete lijstaanvraag.
Eigenaarstoets, MFA, audit en navigatiewaarschuwing voor concepten blijven intact.
Schoolaantallen heten leerlingkaarten; activiteit is sessie of lesregistratie,
geen aanwezigheidsmeting. De verschillende bronnen zijn niet samengevoegd.

Bewijs: 728 bestaande tests groen; TypeScript, lint en webpack-build groen.
Na deze wijziging: CI/review en Safari-controle van de uitgerolde navigatie.
