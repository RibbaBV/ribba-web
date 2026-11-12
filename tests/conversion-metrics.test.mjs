import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amsterdamDay, nextDay, ratio, parseSegment, sameDayFunnel, buildConversionReport, linePaths, rollingRate } from '../lib/conversion-metrics.ts';
import { readCompletePages } from '../lib/conversion-sources.ts';
const ready={status:'ready'};
const base=()=>({capturedAt:'2026-11-12T18:00:00Z',events:[],accounts:[],schools:[],links:[],receipts:[],referrals:[],states:{events:ready,accounts:ready,schools:ready,links:ready,receipts:ready,referrals:ready}});
let id=1;
const event=(user,screen,at='2026-11-10T12:00:00Z',extra={})=>({id:id++,user_id:user,scherm:screen,ontvangen_op:at,rol:'leerling',school_id:null,soort:'scherm',element:null,ota_id:'release',sessie_id:'s',...extra});
const metric=(r,id)=>r.metrics.find(m=>m.id===id);

test('Amsterdam calendar boundaries and DST use local dates, not fixed UTC offsets',()=>{
 assert.equal(amsterdamDay('2026-11-11T23:30:00Z'),'2026-11-12');
 assert.equal(amsterdamDay('2026-07-01T22:30:00Z'),'2026-07-02');
 assert.equal(nextDay('2026-03-28',2),'2026-03-30');
 assert.equal(ratio(0,0),null);assert.equal(ratio(0,2),0);
 assert.equal(parseSegment('parents'),null);
});
test('funnels require the same user and ordered events; batched timestamps use the server ID',()=>{
 const start=e=>e.scherm==='Theorie',goal=e=>e.scherm==='TheorieHoofdstuk';
 const rows=[event('a','Theorie'),event('a','TheorieHoofdstuk'),event('a','TheorieHoofdstuk'),event('b','TheorieHoofdstuk'),event('b','Theorie'),event('c','Theorie'),event('other','TheorieHoofdstuk')];
 assert.deepEqual(sameDayFunnel([...rows].reverse(),'2026-11-10',start,goal),{numerator:1,denominator:3});
 rows.push(event('c','TheorieHoofdstuk','2026-11-11T12:00:00Z'));
 assert.equal(sameDayFunnel(rows,'2026-11-10',start,goal).numerator,1);
});
test('empty, pre-instrumentation and partially observed days are not fabricated 0% cohorts',()=>{
 const s=base();s.events=[event('old','StudentDashboard','2026-11-09T12:00:00Z'),event('a','Theorie'),event('a','TheorieHoofdstuk'),event('b','Theorie')];
 const r=buildConversionReport(s,7,'leerlingen'),m=metric(r,'activation');
 assert.equal(m.daily.find(p=>p.day==='2026-11-08').value,null);
 assert.equal(m.daily.find(p=>p.day==='2026-11-09').reason,'before_history');
 assert.equal(m.daily.find(p=>p.day==='2026-11-10').value,50);
 assert.equal(m.current,50);assert.equal(m.denominator,2);assert.equal(m.previous,null);assert.equal(m.delta,null);
 assert.equal(m.daily.find(p=>p.day==='2026-11-11').reason,'empty');
});
test('period percentages are weighted cohort ratios, not averages of daily percentages',()=>{
 const s=base();s.events.push(event('old','StudentDashboard','2026-11-07T12:00:00Z'));
 for(let i=0;i<10;i++)s.events.push(event('a'+i,'Theorie','2026-11-08T12:00:00Z'));
 s.events.push(event('a0','TheorieHoofdstuk','2026-11-08T12:01:00Z'),event('b','Theorie','2026-11-09T12:00:00Z'),event('b','TheorieHoofdstuk','2026-11-09T12:01:00Z'));
 const m=metric(buildConversionReport(s,7,'leerlingen'),'activation');
 assert.equal(m.numerator,2);assert.equal(m.denominator,11);assert.equal(m.current,2/11*100);
});
test('retention follows the exact D+1 / D+7 cohort and excludes immature days from summary',()=>{
 const s=base();s.events=[event('old','StudentDashboard','2026-11-01T12:00:00Z'),event('a','StudentDashboard','2026-11-03T12:00:00Z'),event('b','StudentDashboard','2026-11-03T12:00:00Z'),event('a','Theorie','2026-11-10T12:00:00Z'),event('a','Theorie','2026-11-11T12:00:00Z'),event('new','StudentDashboard','2026-11-11T12:00:00Z')];
 const r=buildConversionReport(s,30,'leerlingen');
 assert.equal(metric(r,'retention7').daily.find(p=>p.day==='2026-11-03').value,50);
 assert.equal(metric(r,'retention1').daily.find(p=>p.day==='2026-11-10').value,100);
 const pending=metric(r,'retention7').daily.find(p=>p.day==='2026-11-11');
 assert.equal(pending.value,null);assert.equal(pending.denominator,2);assert.equal(pending.reason,'maturing');
});
test('internal schools and dev events are excluded; role changes never double count a person',()=>{
 const s=base();s.schools=[{id:'internal',is_internal:true,created_at:'2026-11-10T12:00:00Z'}];
 s.events=[event('a','Theorie'),event('a','Agenda','2026-11-10T12:00:00Z',{rol:'eigenaar'}),event('test','Theorie','2026-11-10T12:00:00Z',{school_id:'internal'}),event('dev','Theorie','2026-11-10T12:00:00Z',{ota_id:'dev'})];
 const r=buildConversionReport(s,7,'leerlingen');assert.equal(r.quality.users,1);assert.equal(r.quality.events,2);assert.equal(r.northStar.active,1);
 assert.equal(buildConversionReport(s,7,'leerlingen',true).quality.users,2);
});
test('internal-only account links are excluded; an external-school link keeps the account',()=>{
 const s=base();s.schools=[{id:'i',is_internal:true,created_at:'2026-01-01T00:00:00Z'},{id:'e',is_internal:false,created_at:'2026-01-01T00:00:00Z'}];s.accounts=[{id:'only-internal',role:'student',created_at:'2026-11-10T12:00:00Z'},{id:'both',role:'student',created_at:'2026-11-10T12:00:00Z'}];s.links=[{user_id:'only-internal',drivingschool_id:'i'},{user_id:'both',drivingschool_id:'i'},{user_id:'both',drivingschool_id:'e'}];
 const m=metric(buildConversionReport(s,7,'leerlingen'),'acquisition');assert.equal(m.daily.find(p=>p.day==='2026-11-10').value,1);
});
test('a missing source or unknown school exclusions cannot turn into a successful zero measurement',()=>{
 const s=base();s.states.events={status:'truncated'};s.events=[event('a','Theorie')];
 const m=metric(buildConversionReport(s,7,'leerlingen'),'activation');assert.equal(m.current,null);assert.ok(m.daily.every(p=>p.reason==='unavailable'));
 s.states.schools={status:'unavailable'};const missing=buildConversionReport(s,7,'leerlingen');assert.equal(missing.quality.users,0);assert.equal(missing.northStar.users,null);assert.equal(missing.northStar.active,null);
});
test('payment receipts are deduplicated and are never represented as money or first-payment conversion',()=>{
 const s=base();s.receipts=[{id:'older',school_id:'e',provider:'stripe',event_kind:'customer.subscription.created',status:'succeeded',side_effect_stage:'completed',first_received_at:'2026-11-01T12:00:00Z',external_event_id:'old'},...['a','b'].map(id=>({id,school_id:'e',provider:'stripe',event_kind:'invoice.paid',status:'succeeded',side_effect_stage:'completed',first_received_at:'2026-11-10T12:00:00Z',external_event_id:'same-invoice-event'}))];
 const r=buildConversionReport(s,7,'rijscholen');assert.equal(metric(r,'payment_receipts').current,1);assert.equal(metric(r,'revenue').current,null);assert.equal(metric(r,'revenue').evidence,'missing');
});
test('outcomes outside referral window do not count; not-yet-mature cohorts stay provisional',()=>{
 const s=base();s.referrals=[{id:'a',school_id:null,aangemeld_op:'2026-10-01T12:00:00Z',verdiend_op:'2026-10-20T12:00:00Z',void_op:null},{id:'b',school_id:null,aangemeld_op:'2026-10-01T12:00:00Z',verdiend_op:'2026-11-05T12:00:00Z',void_op:null},{id:'c',school_id:null,aangemeld_op:'2026-11-11T12:00:00Z',verdiend_op:null,void_op:null}];
 const m=metric(buildConversionReport(s,90,'leerlingen'),'referral');assert.equal(m.current,50);assert.equal(m.daily.find(p=>p.day==='2026-11-11').provisional,true);
});
test('aggregate response contains no user, school, event or subscription identifiers',()=>{
 const s=base();s.events=[event('PRIVATE_USER','Theorie','2026-11-01T12:00:00Z'),event('PRIVATE_USER','TheorieHoofdstuk','2026-11-02T12:00:00Z')];s.schools=[{id:'PRIVATE_SCHOOL',is_internal:false,created_at:'2026-10-01T12:00:00Z'}];const result=JSON.stringify(buildConversionReport(s,7,'leerlingen'));assert.ok(!result.includes('PRIVATE_'));assert.ok(!result.includes('user_id'));assert.ok(!result.includes('school_id'));assert.ok(!result.includes('sessie_id'));
});
test('line paths preserve missing-history gaps and weighted averages need seven complete days',()=>{
 assert.deepEqual(linePaths([1,null,2,3],300,100,100),['M0.00,99.00','M200.00,98.00 L300.00,97.00']);
 const points=Array.from({length:7},(_,i)=>({day:`2026-11-0${i+1}`,numerator:i===6?1:0,denominator:i===6?1:10,value:0,provisional:false,reason:null}));
 assert.equal(rollingRate(points)[6],1/61*100);assert.equal(rollingRate(points.slice(0,6)).at(-1),null);points[0].provisional=true;assert.equal(rollingRate(points)[6],null);
});
test('paginated reads discard incomplete data rather than undercounting a failed second page',async()=>{
 const result=await readCompletePages(async(from)=>from===0?{data:Array(1000).fill({id:1}),error:null}:{data:null,error:new Error('private SQL')});assert.equal(result.state.status,'unavailable');assert.deepEqual(result.rows,[]);assert.ok(!JSON.stringify(result).includes('private SQL'));
});
test('growth API is owner-only, audit-gated and reads no contact fields',()=>{
 const route=readFileSync('app/api/support/gebruik/conversies/route.ts','utf8');assert.match(route,/withSupportAccess/);assert.match(route,/ownerOnly: true/);assert.match(route,/action: 'appconversies.view'/);assert.match(route,/level: 0/);
 const sources=readFileSync('lib/conversion-sources.ts','utf8');assert.doesNotMatch(sources,/\.select\(['"]\*/);assert.doesNotMatch(sources,/email|first_name|phone|payload|recipient/);
});
