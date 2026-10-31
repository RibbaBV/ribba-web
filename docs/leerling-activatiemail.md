# Gedeelde wachtwoordpagina voor leerlingactivatie

31 oktober 2026. Hoofd-handoff en server/app-code:
`ribbaPro/docs/handoff/leerling-activatiemail.md`, branch
`codex/leerling-activatiemail` in beide repositories.

`/set-password` gebruikt nu dezelfde herstel-/sessie-/MFA-controles als
`/reset`, via `app/components/PasswordFlow.tsx`. De activatievariant behoudt
de bestaande huisstijl, appstoreknoppen en het instellen van een wachtwoord.
Bij een onbruikbare link kan iemand zelf een nieuwe aanvragen, ook zonder
rijschool. De pagina toont voor welk account het wachtwoord wordt ingesteld.

Verificatie: 592 bestaande webtests geslaagd, waarvan 25 hersteltests;
TypeScript en gerichte ESLint groen. Lokale browsercontrole met een echte
lokale Auth-herstelsessie toont de juiste gebruiker. Wachtwoordopslaan en
inloggen apart tegen lokale Auth bewezen in de hoofd-handoff. Geen productie
of echte e-mailbezorging getest. Nieuwe schooluitnodiging en mobiele browser
blijven acceptatiestappen vóór uitrol. Er is nog niet gemerged of gedeployd.
