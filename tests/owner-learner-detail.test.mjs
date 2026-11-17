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
