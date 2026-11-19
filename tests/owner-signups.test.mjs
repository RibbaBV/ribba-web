// Inschrijvingendashboard (19 nov 2026): invoer, payload, lijst, maanden en routecontract.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWeeksParam,parseSignupWeeks,percentage,checkoutRate,activationRate,payingRate,weekLabel,dayLabel,daysSince,signupsByMonth} from '../lib/owner-signups.ts';

const nul={started:0,checkout:0,abandoned:0,open:0,activated:0,trialing:0,paying:0,stopped:0};
const PAYLOAD={status:'ready',captured_at:'2026-11-19T10:00:00Z',definition_version:2,weeks_requested:12,from:'2026-09-01',
 abandon_after_days:7,excluded_tests:3,last_signup_at:'2026-10-28T19:38:07Z',
 signups:[{created_at:'2026-10-28T19:38:07Z',name:'Autorijschool Actiepunt',city:'Barendrecht',stage:'trialing'},
  {created_at:'2026-09-09T13:52:57Z',name:'Rijschool Urk',city:null,stage:'abandoned'},
  {created_at:'2026-09-30T22:30:00Z',name:'Middernacht',city:'',stage:'paying'}],
 weeks:[{week_start:'2026-11-17',...nul},{week_start:'2026-09-08',...nul,started:2,checkout:1,abandoned:1,activated:1,paying:1}],
 totals:{...nul,started:2,checkout:1,abandoned:1,activated:1,paying:1}};

test('weeks-param: leeg is 12, alleen 4/12/26 mag',()=>{
 assert.equal(parseWeeksParam(null),12);assert.equal(parseWeeksParam(''),12);
 for(const w of ['4','12','26'])assert.equal(parseWeeksParam(w),Number(w));
 for(const w of ['0','5','52','-4','12a',' 12','1e1','100'])assert.equal(parseWeeksParam(w),null,w);
});

test('payload: geldige vorm komt door, nieuwste week eerst blijft behouden',()=>{
 const p=parseSignupWeeks(PAYLOAD);
 assert.ok(p);assert.equal(p.weeks[0].week_start,'2026-11-17');assert.equal(p.totals.paying,1);assert.equal(p.excluded_tests,3);
});

test('payload: afwijkende vorm wordt geweigerd, niet half getoond',()=>{
 for(const bad of [null,{},{...PAYLOAD,status:'collecting'},{...PAYLOAD,totals:{...PAYLOAD.totals,paying:-1}},
  {...PAYLOAD,weeks:[{...PAYLOAD.weeks[0],week_start:'17-11-2026'}]},{...PAYLOAD,weeks:[{week_start:'2026-11-17'}]},
  {...PAYLOAD,totals:{...PAYLOAD.totals,started:1.5}},{...PAYLOAD,weeks:'x'},
  {...PAYLOAD,signups:undefined},{...PAYLOAD,last_signup_at:'gisteren'},{...PAYLOAD,captured_at:'invalid'},{...PAYLOAD,last_signup_at:undefined},
  {...PAYLOAD,signups:[{...PAYLOAD.signups[0],stage:'unknown'}]},{...PAYLOAD,signups:[{...PAYLOAD.signups[0],name:null}]}])
  assert.equal(parseSignupWeeks(bad),null,JSON.stringify(bad));
});

test('percentages zijn veilig bij 0 en afgerond',()=>{
 assert.equal(percentage(1,0),null);assert.equal(percentage(0,0),null);assert.equal(percentage(1,3),33);
 assert.equal(checkoutRate(nul),null);assert.equal(activationRate(nul),null);assert.equal(payingRate(nul),null);
 assert.equal(checkoutRate(PAYLOAD.totals),50);assert.equal(payingRate(PAYLOAD.totals),100);
});

test('weeklabel: maandag tot zondag, ook over een maandgrens',()=>{
 assert.equal(weekLabel('2026-11-17'),'17 nov – 23 nov');
 assert.equal(weekLabel('2026-09-28'),'28 sep – 4 okt');
 assert.equal(weekLabel('2026-12-28'),'28 dec – 3 jan');
});

test('route: juiste rpc, action en eigenaarpoort; geen persoonsgegevens',()=>{
 const src=readFileSync(new URL('../app/api/support/dashboard/signups/route.ts',import.meta.url),'utf8');
 assert.match(src,/rpc\('owner_signup_weeks',\{p_actor:user\.id,p_weeks:weeks\}\)/);
 assert.match(src,/action:'owner\.signups\.read'/);assert.match(src,/ownerOnly:true/);assert.match(src,/level:0/);
 assert.match(src,/nog niet beschikbaar/);
 const page=readFileSync(new URL('../app/(support)/support/dashboard/inschrijvingen/page.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(page,/email|e-mailadres/i);
});

test('hoofddashboard linkt naar het weekoverzicht',()=>{
 const view=readFileSync(new URL('../app/(support)/support/dashboard/dashboard-view.tsx',import.meta.url),'utf8');
 assert.match(view,/href="\/support\/dashboard\/inschrijvingen"/);
});

test('lijst: naam, plaats en fase komen door; lege plaats wordt null',()=>{
 const p=parseSignupWeeks(PAYLOAD);
 assert.equal(p.signups.length,3);assert.equal(p.signups[0].name,'Autorijschool Actiepunt');
 assert.equal(p.signups[1].city,null);assert.equal(p.signups[2].city,null);
 assert.equal(p.last_signup_at,'2026-10-28T19:38:07Z');
 assert.equal(parseSignupWeeks({...PAYLOAD,last_signup_at:null,signups:[]}).last_signup_at,null);
});

test('datum en dagen tellen in Nederlandse tijd',()=>{
 assert.equal(dayLabel('2026-10-28T19:38:07Z'),'28 okt');
 assert.equal(dayLabel('2026-09-30T22:30:00Z'),'1 okt');
 assert.equal(daysSince('2026-10-28T19:38:07Z','2026-11-19T15:46:00Z'),22);
 assert.equal(daysSince('2026-11-19T00:10:00+01:00','2026-11-19T22:00:00Z'),0);
 assert.equal(daysSince('2026-11-18T22:59:00Z','2026-11-18T23:01:00Z'),1);
});

test('maanden: elke maand in de periode, ook leeg, met groepen',()=>{
 const p=parseSignupWeeks(PAYLOAD);
 const m=signupsByMonth(p.signups,'2026-08-31','2026-11-19T15:46:00Z');
 assert.deepEqual(m.map(x=>x.label),['aug','sep','okt','nov']);
 assert.deepEqual(m.map(x=>x.total),[0,1,2,0]);
 assert.deepEqual(m[2].counts,{paying:1,trialing:1,abandoned:0,other:0});
 assert.equal(m[1].counts.abandoned,1);
 assert.deepEqual(signupsByMonth([],'2026-12-28','2027-01-05T10:00:00Z').map(x=>x.key),['2026-12','2027-01']);
});
