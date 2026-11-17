// De leerlingkaart (17 nov 2026): invoercontrole en samenvatting, zonder netwerk.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLearnerDetailQuery,activiteitSamenvatting} from '../lib/owner-learners.ts';

const ID='8c6b1ddc-62bd-4267-add4-db8c1f0117da';
test('alleen een geldig uuid en een reden van 10–300 tekens komen door',()=>{
 assert.deepEqual(parseLearnerDetailQuery(ID.toUpperCase(),{reason:'  Nagaan of deze leerling terugkomt  '}),{userId:ID,reason:'Nagaan of deze leerling terugkomt'});
 for(const [id,body] of [[ID,{reason:'kort'}],[ID,{reason:'x'.repeat(301)}],[ID,null],[ID,{}],['niet-een-uuid',{reason:'Nagaan of deze leerling terugkomt'}],[undefined,{reason:'Nagaan of deze leerling terugkomt'}],[ID+"'",{reason:'Nagaan of deze leerling terugkomt'}]])
  assert.equal(parseLearnerDetailQuery(id,body),null,String(id));
});
test('samenvatting is eerlijk over niet-gemeten gebruik',()=>{
 const leeg={measured_since:'2026-11-10',last_event_at:null,active_days_7:0,active_days_30:0,events_30:0,days:[],per_day:[],top_screens:[]};
 assert.match(activiteitSamenvatting(leeg),/Geen gemeten appgebruik sinds de meting begon \(2026-11-10\)/);
 assert.equal(activiteitSamenvatting({...leeg,last_event_at:'2026-11-17T10:00:00Z',active_days_7:3,active_days_30:9,events_30:120}),'3 van de laatste 7 dagen actief · 9 van de laatste 30 · 120 handelingen in 30 dagen');
});
