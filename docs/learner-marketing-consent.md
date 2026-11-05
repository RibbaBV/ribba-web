# Campagnevoorbereiding — leerlingtoestemming

Lokale branch `feat/learner-marketing-consent`, basis `ea7f335`. Nog geen
productie-uitrol; er worden geen marketingberichten verstuurd.

Het gezamenlijke contract, appflow, database-eigendom, onderzoek, oude clients,
leeftijdsgrens, intrekking en acceptatie staan in ribbaPro:
`docs/handoff/learner-marketing-consent.md`. Migraties uitsluitend daar.

Deze webwijziging voegt een geaggregeerd campagneblok toe aan het bestaande
leerlingdashboard. Nieuwe read-only GET-route gebruikt dezelfde server-side
owner/MFA/audit-poort. De bestaande niveau-2-leerlingenlijst leest via de nieuwe
DB-wrapper één marketingstatus per rij. Geen vrij toegankelijke adressenlijst,
geen nieuwe eigenaarbinding, geen export, geen verzending of mailingprovider.

Vereist vóór deploy: exacte gemergede DB-migratie
`20261105160000_learner_marketing_consent.sql` toepassen met apart GO.
Bij ontbrekende RPC blijft de read fail-closed (503), nooit een verzonnen nul.
Bestaande samenvatting blijft via de oorspronkelijke learner-summary werken.

Legacy `inquiries.marketing_optin` is historische aanvraaginformatie. De nieuwe
campagnebron is `learner_marketing_preferences`; de webintake wordt niet
gewijzigd en verstuurt nog steeds operationele aanvraagmails bij echte submits.
Deze route is tijdens ontwikkeling alleen met mocks getest, niet live ingediend.

Testen: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` en
`node scripts/check-support-isolation.mjs`. Nieuwe route in support-auth-matrix:
nonowner, audituitval, ownerlookupuitval, ontbrekende/oude MFA, actorbinding en
no-store. Werkelijke productie-owner/nonowner-acceptatie na aparte vrijgave.

Terugweg: webdeploy terug; bewaarde intrekkingen nooit terugdraaien. Voor een
latere campagne blijven provider, actuele toestemming bij elke verzending,
afmeldlink zonder login en bounce-afhandeling afzonderlijk werk.

Lokaal bewijs 5 november: 615 tests geslaagd; TypeScript en productiebuild met
Next 16.2.12 / webpack groen; supportisolatie groen. ESLint nul fouten, drie
bestaande waarschuwingen. Campagnecomponent met fictieve cijfers visueel
gecontroleerd op desktop en 390px, zonder horizontale overloop. Geen live
accountdata voor die preview gebruikt. Tijdelijke preview/server gesloten.
