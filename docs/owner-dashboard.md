# Eigenaarsdashboard

Lokale implementatie. Niet uitgerold. Databasecontract/migratie en activering
horen uitsluitend bij ribbaPro: 20261016120000_owner_dashboard.sql en
supabase/ops/owner-dashboard-activate.sql. Geen migraties in deze repository.

Routes: /support/dashboard, /api/support/dashboard (GET),
/api/support/dashboard/access (GET), /api/support/dashboard/insights (POST).
Alle API's controleren server-side ownerOnly via withSupportAccess. UI-link
is alleen gemak. Elke datarespons heeft bestaande no-store headers.

Configuratie voor AI: OPENAI_API_KEY en GROWTH_AI_MODEL (beide server-only).
Model bewust configureerbaar, niet stil gekozen. Provideruitvoer via Responses
met store:false, strikt schema, timeout en maximaal 1800 outputtokens. Geen
schoolidentiteiten naar de provider. store:false is geen algemene belofte dat
providerlogs nooit worden bewaard; controleer providerafspraken vóór activering.
API-contract gecontroleerd met officiële documentatie:
https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

AI is op verzoek, maximaal 4 pogingen/24 uur en 1/10 minuten via databaseclaim.
Alleen servergemeten data, geen prompt/body van client. React rendert advies als
tekst. Geen tools, contactacties of automatische wijzigingen.

Data: snapshot elke zes uur, laatste stand per Amsterdamdag. Geen verzonnen
historie. Activiteit heet bewust 'Scholen met registraties': les-/factuuraanmaak
inclusief automatisering, geen menselijke DAU. Verwijderde bronrecords kunnen
historische vergelijkingen beïnvloeden. UI legt dit uit. School-level snapshots
400 dagen; totaalstanden 1095 dagen; AI-output 90 dagen. Stale >30 uur blokkeert AI.

Acceptatie nog open: productie ownerbinding (geverifieerd eigenaaraccount
→ vast UUID), migratie/grants/cron, echte tellingen, browser bij beide rollen,
AI-configuratie en eerste echte providerresponse. Geen productiedata aangepast.

Bij ieder geslaagd AI-voorstel wordt de exacte geaggregeerde onderbouwing mee
opgeslagen. Daardoor blijft de broncontrole mogelijk als de dagstand later
wordt ververst. De UI toont deze oorspronkelijke tellingen naast het voorstel.

## Lokale verificatie 16 oktober 2026

- 481 webtests geslaagd (inclusief owner-only API, audituitval, periodevalidatie,
  providerfouten, allowlist van AI-input en opgeslagen oorspronkelijke evidence).
- TypeScript en definitieve productiebuild geslaagd; lint 0 fouten, 3 bestaande waarschuwingen.
- Supportisolatiecontrole geslaagd; tijdelijke previewroute verwijderd.
- Echte presentatiecomponent op desktop en 390px gecontroleerd met gelabelde
  fictieve fixtures; geen horizontale overflow. Periodekeuze, collecting,
  denied, error/retry en stale met uitgeschakelde AI gecontroleerd.
- Database: tijdelijke PostgreSQL 17, owner/revoked/staff/anon/authenticated,
  tellingen, testschool/import/future-exclusie, idempotente snapshot, AI-limiet,
  resultaatopslag, schoolverwijdering en alle bewaartermijnen geslaagd.
- Live data, echte provider, CI en productieacceptatie nog niet uitgevoerd.
