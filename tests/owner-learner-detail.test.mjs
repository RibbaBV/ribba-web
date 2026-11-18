// De leerlingkaart (17 nov 2026): invoercontrole en samenvatting, zonder netwerk.
// Sinds 18 nov 2026 zonder getypte reden: de server logt een vaste reden.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLearnerDetailQuery,activiteitSamenvatting,KAART_INZAGE_REDEN,LIJST_INZAGE_REDEN} from '../lib/owner-learners.ts';

const ID='8c6b1ddc-62bd-4267-add4-db8c1f0117da';
test('alleen een geldig uuid komt door; hoofdletters worden genormaliseerd',()=>{
 assert.deepEqual(parseLearnerDetailQuery(ID.toUpperCase()),{userId:ID});
 for(const id of ['niet-een-uuid',undefined,null,ID+"'",ID.slice(0,-1),''])assert.equal(parseLearnerDetailQuery(id),null,String(id));
});
test('de vaste inzageredenen zijn niet leeg en zeggen wie kijkt',()=>{
 for(const r of [KAART_INZAGE_REDEN,LIJST_INZAGE_REDEN]){assert.ok(r.length>=10);assert.match(r,/^Eigenaar bekijkt/);}
});
test('samenvatting is eerlijk over niet-gemeten gebruik',()=>{
 const leeg={measured_since:'2026-11-10',last_event_at:null,active_days_7:0,active_days_30:0,events_30:0,days:[],per_day:[],top_screens:[]};
 assert.match(activiteitSamenvatting(leeg),/Geen gemeten appgebruik sinds de meting begon \(2026-11-10\)/);
 assert.equal(activiteitSamenvatting({...leeg,last_event_at:'2026-11-17T10:00:00Z',active_days_7:3,active_days_30:9,events_30:120}),'3 van de laatste 7 dagen actief · 9 van de laatste 30 · 120 handelingen in 30 dagen');
});

// Deelketen (18 nov 2026): de tekst over linkopeningen en de status van een vriend.
import {linkOpeningenTekst,vriendStatus} from '../lib/owner-learners.ts';
const SHARING={code:'K7M2PQ',share_taps_30:4,link_opens:9,link_opens_30:7,link_opens_by_platform:{ios:6,android:3},referred_accounts:2,referred:[]};
test('linkopeningen: eerlijk zonder code, zonder openingen, en met platformverdeling',()=>{
 assert.equal(linkOpeningenTekst({...SHARING,code:null}),'Nog geen deelcode (ontstaat bij de eerste tik op Delen).');
 assert.equal(linkOpeningenTekst({...SHARING,link_opens:0,link_opens_30:0,link_opens_by_platform:{}}),'Link nog niet geopend.');
 assert.equal(linkOpeningenTekst(SHARING),'9 keer geopend (7 in 30 dagen), waarvan 6 op iPhone en 3 op Android.');
 assert.equal(linkOpeningenTekst({...SHARING,link_opens:1,link_opens_30:1,link_opens_by_platform:{other:1}}),'1 keer geopend (1 in 30 dagen), waarvan 1 op anders.');
});
test('een vriend met alleen een account is nog geen actieve leerling',()=>{
 const basis={user_id:'u',email:'v@x.test',registered_at:'2026-11-18T10:00:00Z',first_event_at:null,last_event_at:null};
 assert.equal(vriendStatus(basis),'account aangemaakt, nog niet in de app geweest');
 assert.equal(vriendStatus({...basis,first_event_at:'2026-11-18T11:00:00Z',last_event_at:'2026-11-18T11:00:00Z'}),'één keer in de app geweest');
 assert.equal(vriendStatus({...basis,first_event_at:'2026-11-18T11:00:00Z',last_event_at:'2026-11-19T09:00:00Z'}),'actief');
});
