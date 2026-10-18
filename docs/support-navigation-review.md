# Supportnavigatie en controle — 18 oktober 2026

Branch `feat/support-navigation`, vanaf productiecommit `89683c5` in ribba-web.

## Wijzigingen

- Eén eigenaarmenu in de gedeelde support-layout, met actieve pagina, desktopzijbalk en mobiele navigatie. Dubbele paginanavigatie verdwijnt alleen wanneer dit menu beschikbaar is.
- Na daadwerkelijke login/MFA-voltooiing opent het dashboard uitsluitend na een positieve servercontrole op het huidige token. `/support` blijft rechtstreeks het rijscholenoverzicht; geen redirectlus via de menuknop.
- Niet-opgeslagen schoolgegevens en hulpvragen worden beschermd bij links, herladen/sluiten en wisselen van rijschool. Meerdere hulpvraagformulieren registreren hun eigen wijzigingsstatus.
- Geen API-, database-, accountrechten- of authenticatiewijzigingen. Owner-only, sessie-isolatie en verse MFA blijven servervoorwaarden.

## Controle per pagina en bediening

| Pagina | Live gecontroleerd | Aanvullende code/testcontrole |
| --- | --- | --- |
| Login / tweefactor | Gebruiker logde opnieuw in; bestaande eigenaargegevens laden | Login, factorselectie, inschrijving, verlopen sessie en logoutlogica behouden; nieuwe redirect nog lokaal, niet live |
| Dashboard | 7/30 dagen wisselen levert andere tellingen; eigenaargegevens en bewaarde AI-voorstellen zichtbaar; navigatie naar scholen en klantreis | AI-aanvraag niet opnieuw verstuurd; fout/herproberen en limieten via bestaande tests |
| Rijscholen | Zoeken op Sezen levert één school; dossierlink werkt; leeg filter en reset werken; testscholen schakelt 6 → 12 → 6; Meer gegevens klapt open | Uitloggen geïnspecteerd; geen logout op productie |
| Dossier | Schoolgegevens, onboarding, koppelingen en gebeurtenissen laden; dashboardlink en bewerklink werken | Sectieankers en bestaande herstelweergave behouden |
| Schoolgegevens | Formulier opent; opnieuw laden werkt; terug naar dossier werkt | Validatie, wijzigingsdetectie, conflictcontrole en opslagroute via bestaande tests; geen klantgegevens opgeslagen |
| Klantreis | Alle scholen en Sezen selecteren; uitlegpanelen openen; registratieformulier en gebeurtenissen laden | Registratie/aanpassen/afronden en opslagfouten geïnspecteerd; geen fictieve hulpvraag op productie aangemaakt |

Dit is geen claim dat elke muterende actie end-to-end op productie is uitgevoerd. Nieuwe loginredirect en volledige navigatie met opgeslagen sessie vragen nog acceptatie op preview/productie na uitrol. De lokale navigatiepreview gebruikt expliciet fictieve inhoud en wordt verwijderd vóór build.

## Verdere vormgeving: aanbevolen vervolg

1. Klantreis: hulpvraag en open opvolging hoger plaatsen; technische meetuitleg als uitklapbare sectie onderaan. De huidige pagina geeft metingen meer nadruk dan de dagelijkse supportactie.
2. Dossier: compacte samenvatting met abonnement, onboarding en recente problemen, daarna detailsecties. Historische fouten duidelijker scheiden van actuele storingen zonder herstel te verzinnen.
3. Formulieren: duidelijke status voor niet-opgeslagen wijzigingen en laatst geslaagde opslag; actieknoppen consequent plaatsen.
4. Overzicht: sorteren op laatste activiteit of aanmelddatum en filters op abonnement, pas na een eenduidige definitie van de brongegevens.

Voor deze vervolgpunten zijn geen nieuwe gegevensbronnen of productierechten toegevoegd.

## Definitieve verificatie

- 500 bestaande tests geslaagd, productiebuild en typecontrole geslaagd; lint heeft uitsluitend drie bestaande waarschuwingen buiten support.
- Support-isolatiecontrole geslaagd; geen marketingcode toegevoegd aan support.
- Tijdelijke lokale menuvoorbeeldpagina gecontroleerd op desktop en 390px mobiel (documentbreedte eveneens 390px). Bij gewijzigde voorbeeldinvoer bleef de pagina staan na een navigatiepoging; geen klantgegevens gebruikt.
- Tijdelijke previewroute verwijderd vóór definitieve build. Gereed voor PR-review; nog niet gemerged of live.
- Browser-terug/vooruit binnen de SPA is geen nieuw onderschepte handeling; de waarschuwing dekt menulinks, paginalinks, schoolselectie en documentverlaten. Geen volledige end-to-end login of opslagtest op de nieuwe branch uitgevoerd.
