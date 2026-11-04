import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLearnerQuery} from '../lib/owner-learners.ts';
import {learnerDigestMail,sendLearnerDigest} from '../lib/owner-learner-digest.ts';
import {learnerEvidence} from '../lib/owner-dashboard.ts';
const valid={filter:'without_active',query:' person@example.test ',page:0,reason:'Registratieproblemen onderzoeken'};
test('learner query bounds and reason are validated',()=>{
 assert.equal(parseLearnerQuery(valid).query,'person@example.test');
 for(const v of [null,{}, {...valid,reason:' '},{...valid,page:-1},{...valid,page:1.5},{...valid,page:10001},{...valid,filter:'toString'},{...valid,query:'x'.repeat(101)}])assert.equal(parseLearnerQuery(v),null);
});
const digest={day:'2026-11-04',recipient:'owner@example.test',lease_id:'claim',payload:{new_accounts:2,without_active_school:5,never_signed_in:1,incomplete_without_school:3}};
test('digest is aggregate-only and links to protected dashboard',()=>{
 const mail=learnerDigestMail(digest);
 assert.deepEqual(mail.to,['owner@example.test']);assert.match(mail.text,/support\/dashboard\/learners/);
 assert.throws(()=>learnerDigestMail({...digest,payload:{...digest.payload,new_accounts:-1}}));
 assert.throws(()=>learnerDigestMail({...digest,day:'<script>'}));
});
test('digest retries use same provider key and payload; provider failures cannot become success',async(t)=>{
 const requests=[];let ok=true;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');requests.push(init);return {ok,json:async()=>({id:'mail'})};});
 await sendLearnerDigest(digest,'fake');await sendLearnerDigest({...digest,lease_id:'retry'},'fake');
 assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
 ok=false;await assert.rejects(sendLearnerDigest(digest,'fake'));
});
test('AI learner evidence only includes aggregate allowlist, never identities or metadata',()=>{
 const facts=learnerEvidence({captured_at:'2026-11-04T12:00:00Z',definition_version:1,metrics:{accounts:1,new_30:1,without_active_school:1,no_school:1,waitlist:0,never_signed_in:1,incomplete_without_school:1,email:'PRIVATE'},rows:[{name:'PRIVATE',email:'PRIVATE'}],secret:'PRIVATE'});
 assert.ok(!JSON.stringify(facts).includes('PRIVATE'));assert.equal(facts.window_days,30);
});
