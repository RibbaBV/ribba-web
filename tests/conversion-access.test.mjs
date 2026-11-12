import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
let owner=true, staff=true, auditFails=false, authenticated=true, reads=0;
const logs=[];
const client={auth:{getUser:async()=>({data:{user:authenticated?{id:'staff-actor',email:'support@example.test'}:null},error:null})},rpc:async(name)=>({data:name==='is_platform_staff'?staff:owner,error:null}),from:(name)=>{
 if(name==='platform_access_log')return{insert:async(row)=>{logs.push(row);return{error:auditFails?new Error('audit unavailable'):null}}};
 reads++;throw new Error('Raw data must not be read before the access gate');
}};
mock.module('@supabase/supabase-js',{namedExports:{createClient:()=>client}});
let sourceCalls=0;
mock.module('../lib/conversion-sources.ts',{namedExports:{loadConversionSources:async()=>{sourceCalls++;const state={status:'ready'};return{capturedAt:'2026-11-12T12:00:00Z',events:[],accounts:[],schools:[],links:[],receipts:[],referrals:[],states:{events:state,accounts:state,schools:state,links:state,receipts:state,referrals:state}}}}});
const { GET }=await import('../app/api/support/gebruik/conversies/route.ts');
const token=(aal='aal2',age=0)=>`h.${Buffer.from(JSON.stringify({aal,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]})).toString('base64url')}.s`;
const request=(auth=token(),query='')=>new NextRequest('https://mijn.ribba.app/api/support/gebruik/conversies'+query,{headers:auth?{Authorization:`Bearer ${auth}`}:{}});
const reset=()=>{owner=true;staff=true;auditFails=false;authenticated=true;reads=0;sourceCalls=0;logs.length=0};
test('conversion endpoint: anonymous, invalid session, missing/old MFA and non-owner requests never reach sources',async()=>{
 reset();assert.equal((await GET(request(null))).status,401);
 authenticated=false;assert.equal((await GET(request())).status,401);authenticated=true;
 assert.equal((await GET(request(token('aal1')))).status,403);
 assert.equal((await GET(request(token('aal2',8*60*60+1)))).status,403);
 staff=false;assert.equal((await GET(request())).status,403);staff=true;
 owner=false;assert.equal((await GET(request())).status,403);
 assert.equal(sourceCalls,0);assert.equal(reads,0);
});
test('audit failure is fail-closed; successful owner request returns only aggregate report with no-store headers',async()=>{
 reset();auditFails=true;assert.equal((await GET(request())).status,503);assert.equal(sourceCalls,0);
 reset();const response=await GET(request());assert.equal(response.status,200);assert.equal(sourceCalls,1);assert.equal(logs[0].action,'appconversies.view');assert.equal(logs[0].result,'ok');assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(response.headers.get('Vary'),'Authorization');
 const body=await response.json();assert.equal(body.version,1);assert.equal(body.segment,'leerlingen');assert.ok(!JSON.stringify(body).includes('staff-actor'));
});
test('invalid segment is rejected after authentication/audit and before source reads',async()=>{
 reset();const response=await GET(request(token(),'?doelgroep=arbitrary'));assert.equal(response.status,400);assert.equal(sourceCalls,0);
});
