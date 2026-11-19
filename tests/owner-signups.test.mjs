// Weekoverzicht van rijschool-inschrijvingen (19 nov 2026): invoer, payload en routecontract.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseWeeksParam,parseSignupWeeks,percentage,checkoutRate,activationRate,payingRate,weekLabel} from '../lib/owner-signups.ts';

const nul={started:0,checkout:0,abandoned:0,open:0,activated:0,trialing:0,paying:0,stopped:0};
const PAYLOAD={status:'ready',captured_at:'2026-11-19T10:00:00Z',definition_version:1,weeks_requested:12,from:'2026-09-01',
 abandon_after_days:7,excluded_tests:3,
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
  {...PAYLOAD,totals:{...PAYLOAD.totals,started:1.5}},{...PAYLOAD,weeks:'x'}])
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
