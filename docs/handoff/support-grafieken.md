# Groei en dagelijks gebruik — 24 november 2026

De lange dagelijkse tabel op Gebruikers is vervangen door twee grafiekkaarten:
nieuwe accounts als gestapelde kolommen en unieke actieve gebruikers per dag
als lijnen. Leerlingen zonder rijschool zijn mintgroen, met rijschool blauw;
onbekende historische registratie-indeling staat apart in grijs. Eén
rolschakelaar toont leerlingen of rijschoolgebruikers, binnen de bestaande
7/30/90-dagenkeuze.

Nieuwe accounts worden opgeteld over de periode. Actieve gebruikers tonen
uitsluitend het unieke dagtotaal van de geselecteerde dag; dagtotalen worden
niet als unieke periodegebruikers opgeteld. Niet-gemeten activiteit blijft
ontbrekend, ook bij selectie. De datumselectie werkt via grafiekpointer en
een bereikschuif met toetsenbordbediening. De legenda opent de bestaande
personenaanvraag met dag, rol, metric en cohort. Namen worden niet vooraf geladen.

De dubbele vandaag-KPI-rij en oude miniatuurstaafjes zijn verwijderd. De volledige
tabel blijft standaard ingeklapt onder Bekijk dagcijfers. API, datameting,
eigenaarstoets, MFA en audit zijn ongewijzigd; geen nieuwe dependencies.

Lokale Safari-controle met expliciet fictieve gegevens: kolommen/lijnen naast
elkaar, één kolom op 390px, rolschakelaar, datumselectie, zonder-schooldoorklik
met juist filter en niet-gemeten dagen met uitgeschakelde personenknoppen.
De tijdelijke voorbeeldroute is verwijderd. Geen fysieke mobiele test voor
deze websitewijziging. 728 bestaande tests en gerichte ESLint slagen.
Productiebuild inclusief TypeScript is geslaagd. CI volgt vóór merge; live acceptatie
volgt in Safari na uitrol. Terugdraaien kan met revert van deze presentatie-PR.
