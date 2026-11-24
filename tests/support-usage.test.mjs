import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSelection,parseUsageDays,parseUserSelection,usageDate,usageIsStale} from '../lib/support-usage.ts';
test('bounded filters, literal query, valid calendar date and school UUID',()=>{
 const valid={filter:{...defaultSelection,query:' person@example.test '},page:0};
 assert.equal(parseUserSelection(valid).filter.query,'person@example.test');
 for(const v of [null,{}, {...valid,page:-1},{...valid,page:1.5},{...valid,page:10001},...[
 {kind:'toString'},{cohort:'constructor'},{presence:'yes'},{metric:'unknown'},{school_id:'not-uuid'},
 {query:'x'.repeat(101)},{metric:'new',day:''},{metric:'active',day:'2026-02-30'},{day:'2026-13-01'},
 ].map(f=>({...valid,filter:{...valid.filter,...f}}))])assert.equal(parseUserSelection(v),null);
 assert.ok(parseUserSelection({filter:{...defaultSelection,metric:'active',day:'2026-11-24'},page:0}));
 assert.equal(parseUsageDays('7'),7);assert.equal(parseUsageDays(null),30);assert.equal(parseUsageDays('90'),90);assert.equal(parseUsageDays('0'),null);
});
test('Amsterdam clock and stale data never implied to be live',()=>{
 assert.match(usageDate('2026-11-24T23:30:00Z'),/25 nov/);
 assert.equal(usageIsStale('2026-11-24T10:00:00Z',Date.parse('2026-11-24T10:01:01Z')),true);
 assert.equal(usageIsStale('invalid',Date.now()),true);
});
process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';
let client,opts,calls,logs;
mock.module('@supabase/supabase-js',{namedExports:{createClient:()=>client}});
mock.module('next/server',{namedExports:{NextRequest:class{},NextResponse:{json:(body,init)=>({body,status:init?.status??200,headers:new Headers(init?.headers)})}}});
const {GET,POST}=await import('../app/api/support/gebruikers/route.ts');
const jwt=(aal='aal2',age=0)=>`h.${Buffer.from(JSON.stringify({aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]})).toString('base64url')}.s`;
function setup(o={}){opts=o;calls=[];logs=[];client={auth:{getUser:async()=>({data:{user:{id:'verified-owner'}},error:null})},from:()=>({insert:async value=>{logs.push(value);return {error:opts.logError};}}),rpc:async(name,args)=>{calls.push({name,args});return name==='is_platform_staff'?{data:opts.staff!==false}:name==='is_platform_owner'?{data:opts.owner!==false}:{data:opts.result??{total:0,rows:[]},error:opts.rpcError};}};}
function req(body={filter:defaultSelection,page:0},bearer=jwt(),url='https://ribba.test/api/support/gebruikers'){return {url,headers:new Headers(bearer?{authorization:`Bearer ${bearer}`}:{ }),json:async()=>body};}
const reads=()=>calls.filter(c=>c.name.startsWith('owner_support_'));
test('owner, fresh MFA and audit all required before summary or PII RPC',async()=>{
 for(const [o,token,status] of [[{},null,401],[{},jwt('aal1'),403],[{},jwt('aal2',9*3600),403],[{staff:false},jwt(),403],[{owner:false},jwt(),403],[{logError:{message:'offline'}},jwt(),503]]){
  for(const method of [GET,POST]){setup(o);const r=await method(req(undefined,token));assert.equal(r.status,status);assert.equal(reads().length,0);}
 }
});
test('GET only requests aggregate RPC, authenticated actor and no-store',async()=>{
 setup();const r=await GET(req());assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.deepEqual(reads(),[{name:'owner_support_usage',args:{p_actor:'verified-owner',p_days:30}}]);
});
test('PII list takes query in body; never audit search/email and ignore spoofed actor',async()=>{
 setup();const body={filter:{...defaultSelection,query:'private@example.test'},page:0,p_actor:'spoofed'};
 const r=await POST(req(body));assert.equal(r.status,200);
 assert.equal(reads()[0].args.p_actor,'verified-owner');assert.equal(reads()[0].args.p_filter.query,'private@example.test');
 assert.ok(!JSON.stringify(logs).includes('private@example.test'));assert.ok(JSON.stringify(logs).includes('owner.usage.people'));
});
test('invalid input and unavailable backend never return fabricated zero counts or secrets',async()=>{
 setup();assert.equal((await GET(req(undefined,jwt(),'https://ribba.test/api/support/gebruikers?days=0'))).status,400);assert.equal(reads().length,0);
 setup();assert.equal((await POST(req({filter:{...defaultSelection,metric:'active',day:'2026-02-30'},page:0}))).status,400);assert.equal(reads().length,0);
 setup({rpcError:{message:'secret'}});const r=await GET(req());assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('secret'));
});
const schoolRoutes=await import('../app/api/support/school-accounts/route.ts');
const posthogRoutes=await import('../app/api/support/posthog/route.ts');
test('new school and PostHog endpoints preserve owner MFA and audit gates',async()=>{
 for(const route of [schoolRoutes.GET,schoolRoutes.POST,posthogRoutes.GET]){
  for(const [o,token,status] of [[{},null,401],[{},jwt('aal1'),403],[{owner:false},jwt(),403],[{logError:{message:'failed'}},jwt(),503]]){
   setup(o);const r=await route(req(undefined,token));assert.equal(r.status,status);assert.equal(reads().length,0);
  }
 }
});
test('school card request validates filters and forwards only the verified actor',async()=>{
 setup();assert.equal((await schoolRoutes.POST(req({school:'bad',link:'all',status:'all',page:0}))).status,400);
 assert.equal(reads().length,0);
 setup();const body={school:'06771be4-6019-4e52-bc82-64528166123d',link:'unlinked',status:'graduated',page:0};
 assert.equal((await schoolRoutes.POST(req(body))).status,200);
 assert.deepEqual(reads(),[{name:'owner_support_school_cards',args:{p_actor:'verified-owner',p_school:body.school,p_link:'unlinked',p_status:'graduated',p_page:0}}]);
});
