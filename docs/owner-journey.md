# Klantreis en support — lokale implementatie

16 oktober 2026, fase 1 + compacte fase 2; alleen bestaande eigenaarbinding.
Web: feat/owner-journey. DB: ribbaPro feat/owner-journey-data,
migratie 20261016150000_owner_journey.sql. Het meetcontract, brononderzoek,
beperkingen, bewaartermijnen, uitrol en rollback staan in de canonieke DB-repo:
`docs/handoff/owner-journey.md`.

Nieuwe route: /support/dashboard/journey, bereikbaar vanaf eigenaar-dashboard.
GET/POST /api/support/dashboard/journey gaan via withSupportAccess(ownerOnly),
verse MFA en audit, vervolgens een opnieuw eigenaarcontrolerende RPC. Geen e-mail-
allowlist of ruimere stafftoegang. Data is no-store. Geen marketinginstrumentatie.

UI: schoolkeuze, 100 recente meetgebeurtenissen, open hulpvragen, gestructureerd
formulier, aanpassen/afronden, minuten en opvolgdatum, meetkwaliteit/ontbrekende dekking.
Voorkomt dubbele submit, bewaart request-ID bij retry, toont revisionconflict.
Klantactie != bewezen zelfstandig gebruik. De nieuwe DB-observaties zijn geen
volledige attempt/success/error-funnel; geen conversieclaim op ontbrekende data.

AI: allowlist met geaggregeerde supportcategorieën, vaste 30-dagenperiode en
datakwaliteit. Geen namen, ID's of vrijetekst. Lege supportfeiten en volledig
voltooide gemeten onboarding blokkeren respectievelijk support/activation-advies.

Tests: npm test, tsc --noEmit, npm run lint, next build, supportisolatie.
Lokale browserfixture (niet in commit) bewijst aanmaken/afronden van het formulier;
geen productie-E2E. Productieacceptatie volgt na apart geautoriseerde uitrol.

## Lokaal bewijs

- 498 webtests geslaagd; typecheck geslaagd.
- Lint: geen fouten; drie bestaande waarschuwingen buiten deze wijziging.
- Productiebuild geslaagd met Next 16.2.12 (`--webpack`, zonder runtimeconfig zoals CI).
- Gebouwde support-, dashboard- en journeybundels gecontroleerd: geen marketingcode,
  wel noindex. Publieke marketingpagina's behouden hun bestaande scripts.
- Fictieve browserfixture: hulpvraag aangemaakt (samen ingevuld, 15 minuten), daarna
  afgerond als instellingen aangepast. Tijdelijke previewroute verwijderd vóór build.
- Migratie-apply en productie-deploy zijn nog niet uitgevoerd.
