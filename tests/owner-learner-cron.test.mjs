import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
let calls=[],sent=[],claimed=null,claimError=null,finish=true,sendError=false;
mock.module('../lib/support-auth.ts',{namedExports:{getServiceClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return name==='claim_owner_learner_digest'?{data:claimed,error:claimError}:{data:finish,error:null};}})}});
mock.module('../lib/owner-learner-digest.ts',{namedExports:{sendLearnerDigest:async(data)=>{sent.push(data);if(sendError)throw new Error('provider');}}});
mock.module('next/server',{namedExports:{NextRequest:class{},NextResponse:{json:(body,init)=>({body,status:init?.status??200,headers:new Headers(init?.headers)})}}});
const {GET}=await import('../app/api/cron/owner-learners/route.ts');
const req=(auth)=>({headers:new Headers(auth?{authorization:auth}:{})});
function setup(){calls=[];sent=[];claimError=null;finish=true;sendError=false;claimed={day:'2026-11-04',lease_id:'lease',recipient:'owner@example.test',payload:{new_accounts:1}};process.env.CRON_SECRET='secret';process.env.OWNER_LEARNER_DIGEST_ENABLED='true';process.env.VERCEL_ENV='production';process.env.RESEND_API_KEY='fake';}
test('cron requires secret even when disabled, never trusts caller recipient',async()=>{setup();assert.equal((await GET(req(null))).status,401);assert.equal(calls.length,0);delete process.env.CRON_SECRET;assert.equal((await GET(req('Bearer undefined'))).status,401);});
test('disabled/preview cron never reads data or sends mail',async()=>{for(const env of [{VERCEL_ENV:'preview'},{OWNER_LEARNER_DIGEST_ENABLED:'false'}]){setup();Object.assign(process.env,env);assert.equal((await GET(req('Bearer secret'))).body.status,'disabled');assert.equal(calls.length,0);assert.equal(sent.length,0);}});
test('missing mail configuration does not claim a digest',async()=>{setup();delete process.env.RESEND_API_KEY;assert.equal((await GET(req('Bearer secret'))).status,503);assert.equal(calls.length,0);});
test('no claim means no email (already sent, busy or revoked owner)',async()=>{setup();claimed=null;assert.equal((await GET(req('Bearer secret'))).body.status,'skipped');assert.equal(sent.length,0);});
test('only DB-selected owner receives a digest and completion uses exact lease',async()=>{setup();const res=await GET(req('Bearer secret'));assert.equal(res.body.status,'sent');assert.equal(sent[0].recipient,'owner@example.test');assert.deepEqual(calls[1],{name:'finish_owner_learner_digest',args:{p_day:'2026-11-04',p_lease:'lease'}});assert.ok(!JSON.stringify(res).includes('owner@example.test'));});
test('provider failure is not finalized; failed completion remains an error',async()=>{setup();sendError=true;assert.equal((await GET(req('Bearer secret'))).status,503);assert.equal(calls.length,1);setup();finish=false;assert.equal((await GET(req('Bearer secret'))).status,503);});
