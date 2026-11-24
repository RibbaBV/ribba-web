# Support: gebruikers, aanwezigheid en versies

Status: lokaal gebouwd en gecontroleerd; geen commit, push, apply of release.
GO Onder: 24 november 2026, lokaal bouwen en testen, beide repositories.
Niveau C. Keten: registratie/relaties → snapshots; voorgrond → presence-RPC →
dagmeting → owner/MFA/audit → overzicht en expliciete persoonsinzage.
PostHog, marketing, financiële data en bestaande rechten vallen buiten scope.

## Semantisch contract
- Concept: nieuwe leerlingaccounts, actieve gebruikers, aanwezigheid en appversie.
- Bronfeiten: auth.users.created_at voor nieuw; platform_learner_rows voor huidige
  leerlingpopulatie; actieve instructors voor rijschoolgebruikers. Ouders apart.
  Schoolkaarten zonder loginaccount zijn geen gebruikers. Bestaande testuitsluitingen
  blijven leidend; geen nieuwe email/naamheuristieken.
- Afleiding: één persoon per user_id. Online = laatste bevestigde voorgrondstatus
  van minstens één appsessie jonger dan 90 seconden. Iedere 30 seconden bevestigen.
  Stoppen/achtergrond/uitloggen beëindigt uitsluitend die sessie. Geen presence ooit
  gemeten = onbekend. Ontbrekend signaal kan verbinding of oude app zijn, geen bewijs
  van fysiek offline. Een serverfout is nooit nul gebruikers.
- Actief per dag = minimaal één bevestigde voorgrondmelding op een Amsterdamdag;
  unieke persoon, ingedeeld bij de EERSTE meting van die dag. Schoolindeling en
  school-IDs zijn een dag-snapshot; later veranderen van school herschrijft dat niet.
  Dit meet open appgebruik (ook lezen), geen leerprestatie of bewezen interactie.
- Nieuwe leerlingen = auth-aanmaakdatum per Amsterdamdag. Schoolstatus bij eerste
  herkenning als leerling wordt vastgelegd (auth standalone-marker/profiel/schoolkaart).
  Dit kan iets later zijn dan accountaanmaak; tekst noemt dit expliciet. Historische
  accounts krijgen 'onbekend', geen achteraf verzonnen schoolstatus. Cohort komt nooit
  uit publiek wijzigbare metadata; standalone-marker herkent alleen leerlingidentiteit.
- Presentatie: eerst uitsluitend totalen/trends/schoolnamen; namen/email alleen na
  expliciet openen van de beveiligde lijst. Huidige status en historische selectie
  apart benoemd. Met school = minstens één actieve koppeling; zonder actieve school
  omvat geen koppeling/wachtlijst/geslaagd/gestopt. Die detailstatus blijft zichtbaar.
- Appversie: laatst gemeld door presence of bestaande app_events, platform en OTA apart.
  Oude app_events kunnen alleen een verkorte OTA hebben; presence stuurt het volledige ID.
  Sessies zijn geen bewezen fysieke apparaten; meerdere sessies apart tonen.
  Geen meting = onbekend. Versieverdeling telt laatste gemelde versie per persoon.
- Wie bepaalt: Onder's geaccordeerde plan, 24 november 2026. Niet configureerbaar.
- Opslag: presence per appsessie, één dag-snapshot per gebruiker, één registratie-
  snapshot per leerling. Snapshots zijn nodig voor onveranderlijke historische indeling.
  Gebruiker verwijderen wist zijn meetgegevens via FK cascade. Presence en dagmetingen
  worden na 90 dagen opgeruimd via bestaande dagelijkse opruimfunctie; registratie-
  snapshot blijft zolang het account bestaat. Geen locatie, invoer of scherminhoud.
- Compatibiliteit: bestaande app_events, owner-learners en oude appversies blijven
  werken. Nieuwe RPC's/tabellen zijn additief. Oude apps krijgen geen online-status
  toegedicht. Geen historische presence terugvullen uit klikken.
- Onbekend: productieapply/coverage en apparaatacceptatie zijn nog niet bewezen.
  Basis gecontroleerd via git fetch: ribbaPro 20a7c403d, ribba-web 421cb06.
  Vóór merge opnieuw main controleren.

## Bewijs en terugweg
Gerichte clienttests: voorgrond/achtergrond, accountwissel, timeout en herstel.
DB-matrix via CI: anon/authenticated/staff/owner, revocation, geen tabelinzage,
verkeerde payload, twee sessies/volgorde/expiry, daggrens en dubbele scholen,
registratie zonder login, cohortbehoud, uitsluitingen en verwijdering.
Web: validatie, API-poort, sessieverlies, fout/leeg en mobiele weergave.
Geen Docker lokaal. DB rood/groen vereist concept-PR met afzonderlijk GO voor
commit/push/PR. Daarna pas exact repo-first apply, webdeploy en appuitrol elk met GO.
Terugweg: vorige web/appcode; additieve tabellen kunnen ongebruikt blijven.
Geen klantrecords wijzigen als rollback. Begrensde meting faalt zonder app te hinderen.

## Lokale resultaten, 24 november 2026
- Web: 728 tests groen, TypeScript groen, gerichte ESLint groen.
- App: TypeScript groen; 16 gerichte tests groen (controller, native hook, CI-register).
- Productiebuild via webpack groen; supportisolatie inclusief nieuwe pagina groen.
- SQL-parser: alle 35 statements, SQL-functiebody's en 7 PL/pgSQL-functies syntactisch
  geldig. DB-test: 61 statements en alle DO-blocks syntactisch geldig. Dit is GEEN
  bewijs van catalogus/types/RLS/runtime: daarvoor is de CI-databasetest nodig.
- Browser met expliciet fictieve gegevens op daadwerkelijke Overview-component:
  desktop en 390px mobiel; document 390/390, geen overloop. Geen persoonsaanvraag
  vóór doorklikken; nieuw-zonder-school kiest juiste dag/cohort; sluiten verwijdert
  namen; storing blokkeert actuele online-actie, herstel werkt. Geen live API-authketen.
- Previewroute alleen voor controle, vóór definitieve oplevering verwijderd.
- Screenshots en browsercontrole: /Users/onder/Github/output/support-gebruikersoverzicht/.

## Eerstvolgende poorten
Geen Docker gestart, geen native build, geen productiequery of productiemutatie.
Voor DB-rood/groen eerst apart GO voor een testcommit/push/concept-PR. Commit dan
alleen runner, SQL-test en CI-groep (ontbrekende migratie wordt overgeslagen zodat
het functiecontract zelf rood wordt). Daarna apart GO voor codecommit/push: dezelfde
matrix moet groen worden met migratie. Web-PR eveneens pas na GO. Merge, exacte
migratie-apply, deploy en OTA blijven elk afzonderlijke poorten.
Oude clients en fysieke iPhone/Samsung, verse MFA/signout in live support en de
complete productie-keten zijn nog niet geaccepteerd. De feature is dus niet live klaar.
